# Atelier

An agentic design studio. You brief one **Design Lead**, who splits the work across five specialist desks and reviews what they return.

**Run console** (home): write a brief, dispatch it, watch the desks work.
**The floor** (pop-up): the org chart, studio stats, and roster.

> The demo is scripted. It runs offline with no model. To make it live, attach a model — see below.

## Run

```bash
npm install
npm run dev      # http://localhost:5178
npm run build
```

Requires Node 18+.

## The five desks

| Desk | Does |
| --- | --- |
| UX Research | Competitor scan, UX patterns, adopt / avoid / replicate |
| UX Design | Wireframes, information architecture, user flows |
| UI Design | Pixel-perfect screens, design tokens, interactive states |
| Content Design | UX copy, terminology, voice and tone, style guide |
| Design Ops | Context load, decision log, session summary, state |

## Attach a model

`src/lib/model.ts` speaks the OpenAI-compatible chat API, so any compatible endpoint works. Configure it in `.env` (copy from `.env.example`):

```ini
VITE_AI_BASE_URL=...
VITE_AI_API_KEY=...
VITE_AI_MODEL=...
```

**OmniRoute (local).** Start OmniRoute, then point the base URL at its OpenAI-compatible endpoint (the one serving `/v1/chat/completions`) and pick a model — including its free ones:

```ini
VITE_AI_BASE_URL=http://127.0.0.1:<port>/v1
VITE_AI_API_KEY=<your omniroute key>
VITE_AI_MODEL=deepseek-v4-flash-free
```

**OpenRouter (hosted).** One key, many models, free tiers available:

```ini
VITE_AI_BASE_URL=https://openrouter.ai/api/v1
VITE_AI_API_KEY=<your openrouter key>
VITE_AI_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

To make the desks generate real output, call `complete()` in `src/lib/model.ts` from `src/lib/useRunner.ts`, one call per desk. The desk's `mandate` in `src/lib/studio.ts` is its system prompt.

> `VITE_` values are exposed in the browser bundle. For anything public, proxy the request through a small backend so the key stays server-side.

## Structure

```
src/
  App.tsx                shell
  views/RunConsole.tsx    home: brief, board, activity log
  views/FloorModal.tsx    the floor pop-up
  components/OrgChart.tsx org chart
  lib/studio.ts           desks, copy, run script
  lib/useRunner.ts        run simulation  (wire real calls here)
  lib/model.ts            OpenAI-compatible adapter
  index.css               design system
```

## Design

Bone paper, warm ink, one ultramarine accent. Colour marks status only — queued, working, delivered. Instrument Serif, Instrument Sans, IBM Plex Mono.
