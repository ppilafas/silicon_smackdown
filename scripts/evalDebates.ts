/**
 * Offline debate-quality harness (Phase 3).
 *
 * Runs the REAL shared prompt logic (utils/debatePrompt) against the text
 * model to produce transcripts, then scores them so prompt changes can be
 * judged by numbers instead of vibes:
 *   - repetition  (inter-turn trigram overlap; the Bohr/Einstein loop)
 *   - bleed       (out-of-character "assistant" tells)
 *   - gag         (running-gag callback rate → is the arc landing?)
 *   - laughs      ([LAUGH] density)
 *   - escalation  (does intensity trend up across the show?)
 *
 * Usage:
 *   GEMINI_API_KEY=... npx tsx scripts/evalDebates.ts [--turns=8] [--rivalries=id1,id2] [--lang=en]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';
import { RIVALRIES } from '../constants';
import type { RivalryPair } from '../types';
import {
  DEFAULT_TARGET_TURNS,
  pickRunningGag,
  phaseForTurn,
  buildSystemSuffix,
  buildOpeningPrompt,
  buildTriggerPrompt,
  summarizePoints,
  distillPoint,
} from '../utils/debatePrompt';

type Turn = { speaker: string; text: string };

const args = new Map(
  process.argv.slice(2).map((a) => {
    const m = a.replace(/^--/, '').split('=');
    return [m[0], m[1] ?? 'true'] as [string, string];
  })
);
const TURNS = Number(args.get('turns')) || 8;
const LANG = args.get('lang') || 'en';
// Free tier = 5 req/min. Pace to stay under it; override with --rpm for paid keys.
const RPM = Number(args.get('rpm')) || 5;
const MIN_SPACING_MS = Math.ceil(60000 / RPM);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const pickRivalries = (): RivalryPair[] => {
  const ids = args.get('rivalries');
  if (ids) {
    return ids
      .split(',')
      .map((id) => RIVALRIES.find((r) => r.id === id))
      .filter((r): r is RivalryPair => Boolean(r));
  }
  return RIVALRIES.slice(0, 2);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastCallAt = 0;

async function gen(systemInstruction: string, contents: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = lastCallAt + MIN_SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: { temperature: 0.9, maxOutputTokens: 400, systemInstruction },
      });
      return (res.text ?? '').trim();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const status = e?.status;
      const retryable = status === 429 || status === 500 || status === 503;
      if (retryable && attempt < 5) {
        const m = msg.match(/retry in ([\d.]+)s/i) || msg.match(/"retryDelay":"(\d+)s"/);
        const backoff = m ? Number(m[1]) * 1000 + 1500 : Math.min(60000, 4000 * 2 ** attempt);
        process.stdout.write(`  · ${status} transient, waiting ${Math.round(backoff / 1000)}s…\n`);
        await sleep(backoff);
        continue;
      }
      throw e;
    }
  }
  throw new Error('gen: exhausted retries');
}

async function runDebate(rivalry: RivalryPair): Promise<Turn[]> {
  const [g0, g1] = rivalry.guests;
  const gag = pickRunningGag(rivalry.id);
  const persona = (g: typeof g0) =>
    `${g.systemInstruction}${buildSystemSuffix({ language: LANG })}`;
  const turns: Turn[] = [];
  const points: string[] = [];

  for (let i = 0; i < TURNS; i++) {
    const speaker = i % 2 === 0 ? g0 : g1;
    const rival = i % 2 === 0 ? g1 : g0;
    let contents: string;
    if (i === 0) {
      contents = buildOpeningPrompt({
        speaker: speaker.name,
        rival: rival.name,
        runningGag: gag,
        targetTurns: TURNS,
      });
    } else {
      const transcript = turns.map((t) => `${t.speaker}: ${t.text}`).join('\n');
      contents =
        `Conversation so far:\n${transcript}\n\n` +
        buildTriggerPrompt({
          speaker: speaker.name,
          phase: phaseForTurn(i, TURNS),
          turnIndex: i,
          targetTurns: TURNS,
          runningGag: gag,
          pointsDigest: summarizePoints(points),
        });
    }
    const text = await gen(persona(speaker), contents);
    turns.push({ speaker: speaker.name, text });
    points.push(distillPoint(text));
  }
  return turns;
}

// ---- scoring ----
const STOP = new Set('the a an and or but of to in on for is are was were be it that this you your i we they not with as at by'.split(' '));
const tokens = (s: string) =>
  s.toLowerCase().replace(/\[laugh\]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const trigrams = (ts: string[]) => {
  const set = new Set<string>();
  for (let i = 0; i + 2 < ts.length; i++) set.add(ts[i] + ' ' + ts[i + 1] + ' ' + ts[i + 2]);
  return set;
};
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

const BLEED: Array<[string, RegExp]> = [
  ['assistant-voice', /\bas an? (ai|language model|assistant)\b/i],
  ['self-help', /\b(meditation|mindfulness|stress|anxiety|well-?being|self-?care|cognitive benefits)\b/i],
  ['listicle', /(^|\n)\s*\d+\.\s/],
  ['essay-tells', /\b(in conclusion|it'?s important to|keep in mind|remember that|studies show)\b/i],
];

function score(rivalry: RivalryPair, turns: Turn[]) {
  const tg = turns.map((t) => trigrams(tokens(t.text)));
  // repetition: each turn's max overlap with any earlier same-speaker turn
  const reps: number[] = [];
  for (let i = 1; i < turns.length; i++) {
    let mx = 0;
    for (let j = 0; j < i; j++) {
      if (turns[j].speaker === turns[i].speaker) mx = Math.max(mx, jaccard(tg[i], tg[j]));
    }
    if (mx > 0 || i >= 2) reps.push(mx);
  }
  const repetition = reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : 0;

  let bleedHits = 0;
  const bleedKinds = new Set<string>();
  for (const t of turns)
    for (const [name, re] of BLEED) if (re.test(t.text)) { bleedHits++; bleedKinds.add(name); }

  const gagWords = pickRunningGag(rivalry.id)
    .toLowerCase().split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w));
  const gagTurns = turns.filter((t) => {
    const lc = t.text.toLowerCase();
    return gagWords.some((w) => lc.includes(w));
  }).length;
  const gagRate = turns.length ? gagTurns / turns.length : 0;

  const laughs = turns.reduce((a, t) => a + (t.text.match(/\[LAUGH\]/gi)?.length ?? 0), 0);
  const laughDensity = turns.length ? laughs / turns.length : 0;

  // escalation: slope sign of intensity = words + 3*exclamations over turns
  const intens = turns.map((t) => tokens(t.text).length + 3 * (t.text.match(/!/g)?.length ?? 0));
  const n = intens.length;
  const sx = (n - 1) * n / 2;
  const sy = intens.reduce((a, b) => a + b, 0);
  const sxx = intens.reduce((a, _b, i) => a + i * i, 0);
  const sxy = intens.reduce((a, b, i) => a + i * b, 0);
  const slope = (n * sxy - sx * sy) / Math.max(1, n * sxx - sx * sx);
  const escalation = slope > 1 ? 'up' : slope < -1 ? 'down' : 'flat';

  return { repetition, bleedHits, bleedKinds: [...bleedKinds], gagRate, laughDensity, escalation };
}

(async () => {
  mkdirSync('scripts/eval-out', { recursive: true });
  for (const r of pickRivalries()) {
    process.stdout.write(`\n▶ ${r.name} (${r.id}) — ${TURNS} turns…\n`);
    const turns = await runDebate(r);
    const s = score(r, turns);
    writeFileSync(
      `scripts/eval-out/${r.id}.txt`,
      turns.map((t) => `${t.speaker.toUpperCase()}:\n${t.text}\n`).join('\n')
    );
    console.log(
      `  repetition=${s.repetition.toFixed(3)} (lower=better)  ` +
        `bleed=${s.bleedHits}${s.bleedKinds.length ? ' [' + s.bleedKinds.join(',') + ']' : ''}  ` +
        `gagCallback=${(s.gagRate * 100).toFixed(0)}%  ` +
        `laughs/turn=${s.laughDensity.toFixed(2)}  ` +
        `escalation=${s.escalation}`
    );
  }
  console.log('\nTranscripts → scripts/eval-out/*.txt');
  process.exit(0);
})();
