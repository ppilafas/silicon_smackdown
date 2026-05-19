<div align="center">
<img width="1200" height="475" alt="Silicon Smackdown Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# Silicon Smackdown: AI Talk Show
### 🎭 Real-Time Voice AI Debate Platform Powered by Gemini Live API

[![Live](https://img.shields.io/badge/🔴_Live-ssd.supercore.tech-brightgreen)](https://ssd.supercore.tech)
[![Google Gemini](https://img.shields.io/badge/Powered_by-Google_Gemini-4285F4)](https://ai.google.dev/gemini-api)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)

</div>

## 🌟 Overview

**Silicon Smackdown** is an AI talk show where legendary personalities clash in real-time **voice** debates. Two AI guests, powered by Google's Gemini Live API native-audio model, roast and rebut each other live while **you** play the moderator — steering, cutting in, pausing, and stoking the fire.

It's a **client-side React app** with a thin serverless layer: the browser streams audio directly to/from the Live API for low latency, while a small set of Vercel functions hold the API key and mint short-lived tokens so the key is **never shipped to the browser**.

### 🔥 What Makes It Special

- **🎤 Full-duplex voice AI** — real-time native-audio conversations on `gemini-2.5-flash-native-audio-preview`, one persistent WebSocket session per guest
- **🎬 You're the moderator** — interject by mic or text; a **moderator cut-in** can interrupt a guest mid-sentence and redirect the debate
- **🧠 Debate engine** — a turn arc (`OPEN → ESCALATE → CALLBACK → CLIMAX → CLOSER`), a per-show running gag, and an anti-repetition digest keep debates escalating instead of looping
- **🤖 20+ rivalries** — curated character pairs with distinct voices, personas, and dynamics
- **🔒 Key-safe by design** — ephemeral tokens for Live, proxied REST; the Gemini key stays server-side
- **🌍 Multilingual** — English & Greek (i18next)

## ✨ Key Features

### 🎙️ Voice & Audio
- Real-time audio streaming via Web Audio API + AudioWorklet (ScriptProcessor fallback)
- Live waveform visualization for host and guests
- Gapless cross-speaker audio scheduling (a new speaker starts exactly as the previous one's buffered tail ends)
- Microphone mute + audience-laughter effects

### 🎭 Conversation System
- Typed `useReducer` state machine for turn-taking and speaking state
- Phase-aware, context-primed prompting (each guest's session is warmed with the rival's transcript *during* their turn, so the turn-boundary trigger is tiny and fast)
- Streaming transcription with per-debater bubbles, grouping, and timestamps
- **Moderator cut-in**: a host prompt interrupts the current speaker and immediately hands the next turn to the rival, leading with your instruction

### 🎨 User Experience
- One-click start straight from a rivalry card
- Polished discussion log: per-debater sides/colors, smart auto-scroll + "jump to latest", live turn/phase status
- Pause / resume with seamless continuation
- Session persistence (keyed to the rivalry, so a saved transcript never leaks into a different pairing) + "Start fresh"
- Fully responsive (dedicated mobile layout) + password-gated landing

### 🏗️ Architecture
- Custom hooks: `useConversationState`, `useTranscription`, `useAudioPipeline`, `useGeminiSessions`
- Pure debate-prompt logic centralized in `utils/debatePrompt.ts` (also drives the offline eval harness)
- Serverless functions in `api/` for token minting and REST proxying
- Auto-reconnect with close-code diagnostics

## 🎭 Featured Rivalries

A sample of the 20+ curated matchups (see [`constants.ts`](constants.ts)):

| Rivalry | Characters | Theme |
|---------|-----------|-------|
| **Logic vs. Hype** | Dr. Orion 🤖 vs. Luna Nova 🚀 | Philosophy vs. Futurism |
| **The Detective & The Mastermind** | Sherlock 🔍 vs. Moriarty 🎩 | Genius vs. Criminal Mind |
| **The Genius & The Spider** | Tony Stark 🦾 vs. Peter Parker 🕷️ | Mentor vs. Protégé |
| **The Master & The Hope** | Master Yoda ⚔️ vs. Luke Skywalker 🌟 | Wisdom vs. Youth |
| **The Relativist & The Quantum** | Einstein 🧠 vs. Niels Bohr ⚛️ | Physics Debate |
| **King & Queen** | Jon Snow ❄️ vs. Daenerys 🐉 | Power Struggle |
| **The Mighty Pirate & The Ghost** | Guybrush 🏴‍☠️ vs. LeChuck 👻 | Retro Gaming Legends |

*Each rivalry ships custom system instructions, a prebuilt voice, and a personality-driven style.*

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ (tested on 20)
- **Google Gemini API key** ([get one](https://ai.google.dev/gemini-api/docs/api-key))
- Modern browser with microphone access

### Install

```bash
git clone https://github.com/ppilafas/silicon_smackdown.git
cd silicon_smackdown
npm install
```

### Configure

Create a `.env.local` in the project root:

```env
# Server-only. NOT prefixed with VITE_, so it is never bundled into the
# client. Used by the serverless functions in /api (and by `npm run dev`).
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: soft password gate for the landing page (client-side; not
# a security boundary — just keeps casual visitors out of a demo).
VITE_LANDING_PASSWORD=your_password_here
```

> **Why no `VITE_API_KEY`?** Anything `VITE_`-prefixed is inlined into the public JS bundle. The Gemini key stays server-side: the Live API uses short-lived **ephemeral tokens** minted by `api/token`, and the REST calls are proxied through `api/debate` / `api/tts`. The key never reaches the browser.

### Run

```bash
npm run dev
```

Open the printed local URL and grant microphone access. A custom Vite dev plugin runs the `api/*` functions locally, so `npm run dev` works end-to-end **without** `vercel dev`. (Browser `console` is also mirrored to the dev terminal in development.)

### Build

```bash
npm run build && npm run preview
```

### Evaluate debate quality (optional)

```bash
npm run eval        # scripts/evalDebates.ts — scores transcripts headless
```

Reports repetition, character-bleed, gag callbacks, laughs, and escalation. Needs a non-free-tier `GEMINI_API_KEY` (free tier rate-limits make runs slow/flaky).

## 🎮 How to Use

1. **Pick a rivalry** — one click on a card selects the pair *and* starts the show
2. **Start the show** — press the green Start button to kick off the opening turn
3. **Moderate** — type a prompt to **cut in** and redirect the debate, or use your mic; mute to let the AIs run free
4. **Pause / Resume** — control the flow anytime
5. **Start fresh** — discard a recovered session for a clean slate

## 🛠️ Tech Stack

| Area | Tech |
|------|------|
| Core | React 19, TypeScript 5.8, Vite 6 |
| Styling | Tailwind CSS 3 (PostCSS build — not the CDN) |
| AI & Audio | `@google/genai` (Gemini Live + REST), Web Audio API, AudioWorklet |
| i18n | i18next / react-i18next (EN/EL) |
| UI | Lucide icons, DiceBear avatars |
| Hosting | Vercel (static app + `api/` serverless functions) |

## 🔒 Security Model

- **Key never in the client.** `GEMINI_API_KEY` lives only in the server environment.
- **Live API → ephemeral tokens.** `api/token` mints a single-use, short-expiry token; the browser opens the Live WebSocket directly with that, preserving low latency.
- **REST → proxied.** `api/debate` and `api/tts` call Gemini server-side with fixed models and input caps.
- **No `liveConnectConstraints`.** Setting it (even model-only) locks the whole Live config and breaks per-guest voices — security is enforced via single-use + short expiry instead.
- The landing-page password is a **soft gate only** (client-side), not an auth boundary.

## 🏗️ Project Structure

```
.
├── api/                     # Vercel serverless functions (key-side)
│   ├── token.ts             # mint ephemeral Live API token
│   ├── debate.ts            # proxied debate-script generation
│   └── tts.ts               # proxied TTS
├── components/              # GuestCard, GuestChip, GuestSelector,
│                            # TranscriptionFeed, SplashScreen, …
├── hooks/                   # useConversationState, useTranscription,
│                            # useAudioPipeline, useGeminiSessions
├── pages/                   # DebateTest (pre-gen lab)
├── scripts/                 # evalDebates.ts (offline quality harness)
├── utils/                   # debatePrompt.ts, persistence.ts,
│                            # audio-processing.ts, avatars.ts, devLog.ts
├── i18n/                    # locale resources
├── constants.ts             # rivalry & character definitions
├── types.ts
├── App.tsx                  # main app
├── index.tsx · index.html · index.css
├── vite.config.ts           # incl. dev /api bridge + client-log bridge
└── tailwind.config.js · postcss.config.js
```

## 🧠 Debate Engine

Centralized in [`utils/debatePrompt.ts`](utils/debatePrompt.ts) (pure, so the eval harness exercises the real logic):

- **Arc phases** — `OPEN → ESCALATE → CALLBACK → CLIMAX → CLOSER`, derived from `turn / targetTurns`; each phase injects a distinct directive.
- **Running gag** — one absurd shared motif seeded per show (deterministic from the rivalry id); both guests are told to plant and call back to it. This is what breaks the "restate-your-stance-forever" loop on evenly-matched pairs.
- **Anti-repetition digest** — recent points are distilled and fed back as a "do NOT repeat" list.
- **Context priming** — while a guest speaks, their transcript is streamed into the rival's session with `turnComplete:false`, so the turn-boundary trigger is tiny and fast.
- **Moderator authority** — a host instruction overrides the bit: it becomes the entire next trigger ("the moderator just cut in — address it head-on").

## 🚢 Deployment

Hosted on **Vercel** (project `silicon-smackdown`). The GitHub integration **auto-deploys on every push to `main`** — no manual step. Production: **[ssd.supercore.tech](https://ssd.supercore.tech)**.

`GEMINI_API_KEY` is set as a Vercel project env var (Production + Development). `vercel.json` 308-redirects the deprecated domain to the canonical one.

## 🐛 Troubleshooting

**`/api/token` 404 locally** — you're on plain `vite` without the dev bridge; pull latest (the Vite plugin in `vite.config.ts` serves `api/*` under `npm run dev`).

**Guests stuck "CONNECTING (0/2)"** — usually a Live-config issue (e.g. WS close `1007`). The dev terminal mirrors the browser console (`[Sessions] Session closed code=…`) — read the close code.

**Mic not working** — grant permissions, ensure no other app holds the mic, refresh.

**AI guests not responding** — verify `GEMINI_API_KEY` is set server-side; check the dev terminal / Vercel function logs.

## 🤝 Contributing

PRs welcome. Run `npm run build` (type-checks via `tsc`) before submitting.

## 📄 License

MIT — Built for the Google Gemini Developer Competition.

## 🙏 Acknowledgments

- **Google Gemini Team** — the Live API
- **DiceBear** — avatar generation
- **React Team** — React 19

---

<div align="center">

**[Live Demo](https://ssd.supercore.tech)** • **[Report Bug](https://github.com/ppilafas/silicon_smackdown/issues)** • **[Request Feature](https://github.com/ppilafas/silicon_smackdown/issues)**

Made with ❤️ for the AI community

</div>
