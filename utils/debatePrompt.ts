/**
 * Shared, pure debate-prompt logic — the single source of truth used by both
 * the live app (App.tsx / useGeminiSessions) and the offline eval harness
 * (scripts/evalDebates.ts). No React, no SDK, no I/O.
 *
 * Phases 1 + 2 of the quality plan live here:
 *  - arc awareness (turn index → phase, running gag, anti-repetition digest)
 *  - character integrity + comedy reframe (the shared system suffix)
 */

export type DebatePhase = 'OPEN' | 'ESCALATE' | 'CALLBACK' | 'CLIMAX' | 'CLOSER';

export const DEFAULT_TARGET_TURNS = 12;

/**
 * Absurd shared motifs. One is chosen per show; both guests are told to plant
 * it and call back to it. A forced shared thread is what breaks the
 * "restate-your-stance-forever" loop on evenly-matched pairings.
 */
const RUNNING_GAGS: string[] = [
  'an increasingly petty argument about who has the better catchphrase',
  'a recurring bit where one keeps mishearing a key word as something ridiculous',
  'a running tally of imaginary points awarded by a fictional invisible judge',
  'an escalating bet over something absurdly trivial',
  'a shared inability to stop comparing everything to snacks',
  'a fake sponsor they keep being forced to plug mid-roast',
  'a dramatic, ever-changing backstory about how they first met',
];

/** Deterministic pick from a seed (rivalry id) so a show is internally consistent. */
export function pickRunningGag(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return RUNNING_GAGS[h % RUNNING_GAGS.length];
}

export function phaseForTurn(turnIndex: number, targetTurns: number): DebatePhase {
  const span = Math.max(1, targetTurns);
  if (turnIndex <= 0) return 'OPEN';
  if (turnIndex >= span - 1) return 'CLOSER';
  const p = turnIndex / span;
  if (p >= 0.8) return 'CLIMAX';
  if (p >= 0.45) return 'CALLBACK';
  return 'ESCALATE';
}

const PHASE_DIRECTIVE: Record<DebatePhase, string> = {
  OPEN: 'Open hard with a bold, in-character stance and plant the running gag.',
  ESCALATE: 'Raise the absurdity. Do NOT restate any prior point — top it or pivot.',
  CALLBACK: 'Call back to the running gag and an earlier line, and heighten it.',
  CLIMAX: 'Peak intensity — your biggest, most absurd swing yet. Land the gag hard.',
  CLOSER: 'Wrap with one final mic-drop punchline. Open no new threads.',
};

/**
 * Shared system suffix appended to every guest's persona.
 * Phase 1: anti-restatement rule. Phase 2: character integrity + comedy reframe.
 * Deliberately terse — it is prefilled on every turn (latency).
 */
export function buildSystemSuffix(opts: { language: string }): string {
  const base = [
    '',
    'GLOBAL RULES:',
    '- Stay 100% in character and in-world at all times. Never break frame.',
    '- You are a comedic personality, NOT an assistant. Never give helpful, balanced, encyclopedic, or self-help answers. No "as an AI", no lists, no life advice, no real-world celebrity name-drops unless your character genuinely would.',
    '- Comedy = unexpected, in-character swerves that escalate — not insults or cruelty. Be witty, absurd, and specific. Keep it PG-13.',
    '- When prompted, start speaking immediately — no preamble, no restating the prompt.',
    '- NEVER rephrase a point already made (yours or your rival\'s). Every turn must advance, heighten, or pivot.',
    '- Stay punchy. If a sentence is a genuine punchline, end it with the tag [LAUGH].',
  ].join('\n');
  const greek =
    opts.language === 'el'
      ? '\n\nLANGUAGE: Respond only in natural, modern Greek unless the host explicitly asks otherwise.'
      : '';
  return base + greek;
}

export function buildOpeningPrompt(p: {
  speaker: string;
  rival: string;
  runningGag: string;
  targetTurns: number;
}): string {
  return [
    `You're ${p.speaker}. Your rival ${p.rival} is right across from you.`,
    `This is a ${p.targetTurns}-turn comedic smackdown.`,
    `RUNNING GAG to plant now and call back later: ${p.runningGag}.`,
    `Open the show — no "welcome", no intro, just hit them with a punchy, in-character opener that plants the gag. 2-3 sentences.`,
  ].join(' ');
}

/** Short bulleted digest of points already made, for the anti-repeat rule. */
export function summarizePoints(points: string[], max = 5): string {
  if (points.length === 0) return '';
  return points
    .slice(-max)
    .map((s) => `• ${s}`)
    .join('\n');
}

export function buildTriggerPrompt(p: {
  speaker: string;
  phase: DebatePhase;
  turnIndex: number;
  targetTurns: number;
  runningGag: string;
  hostInstruction?: string;
  pointsDigest?: string;
}): string {
  const host = p.hostInstruction ? `[Host said]: "${p.hostInstruction}"` : '';
  const digest = p.pointsDigest ? `Already said (do NOT repeat):\n${p.pointsDigest}` : '';
  return [
    host,
    digest,
    `Turn ${p.turnIndex + 1}/${p.targetTurns} — PHASE ${p.phase}. ${PHASE_DIRECTIVE[p.phase]}`,
    `Running gag: ${p.runningGag}.`,
    `Your turn, ${p.speaker} — respond now, in character, no preamble. 2-4 punchy sentences.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildPrimeText(p: { speaker: string; delta: string; final?: boolean }): string {
  return p.final
    ? `[${p.speaker} said]: "${p.delta}"`
    : `[${p.speaker} is saying]: "${p.delta}"`;
}

/** Cheap extraction of a turn's gist (first sentence) for the anti-repeat digest. */
export function distillPoint(text: string): string {
  const clean = text
    .replace(/\[LAUGH\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const first = clean.split(/(?<=[.!?])\s/)[0] || clean;
  return first.slice(0, 140);
}
