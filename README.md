# Atelier

An agentic design studio. You brief one **Design Lead**, who splits the work across five specialist desks and reviews what they return.

Two peer modes, switched from the top bar:

- **Project workspace** (home): point the studio at a *real project directory*, describe a change, and get a versioned high-level design proposal to approve, revise, or switch — analysis-first, nothing written until you approve.
- **Brief console**: write a brief, dispatch it, watch the desks work — the scripted simulation.

**The floor** (pop-up): the org chart, studio stats, and roster — reachable from both modes.

> The demo is scripted and the workspace ships against a mock host. Both run offline with no model and no filesystem access. To make either live, attach a model and (for the workspace) a real host — see below.

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

## Project workspace

The project-aware flow runs a five-step journey, all *before* anything is built:

1. **Brief + attach** — describe the change and attach a project directory.
2. **Analyse** — structural detection of framework, styling, components, tokens and themes, each claim backed by the files that prove it. Dependencies, build output, lockfiles, secrets and binaries are never crawled (the ignored tally is shown explicitly).
3. **Decompose** — the brief split into workstreams, one per desk, grounded in the real paths each will touch.
4. **Propose** — a versioned high-level design proposal: requirement understanding, proposed design, a schematic wireframe preview, and implementation impact.
5. **Decide** — approve, revise (new version), choose an alternative (new version), or cancel. Approve lands on a holding card; branch prep, implementation and QA are the next milestone.

**Host seam.** A browser can't read a folder or run `git`, so all filesystem/git access goes through one interface — `HostBridge` in `src/lib/host/`. Milestone 1 ships `MockHost` (canned sample projects) so the whole journey runs offline. Because the analysis engine (`src/lib/project/analyze.ts`) consumes only a `DirListing`, the same code runs unchanged against a real folder once a local adapter (Node companion / Tauri) implements the same interface — swap the export in `src/lib/host/index.ts`.

**Wiring a real model.** `src/lib/project/decompose.ts` and `proposal.ts` are deterministic by default (offline, instant). To generate proposals with a model instead, call `complete()` from `src/lib/model.ts` with the Lead's mandate as the system prompt and the brief + analysis as the user message, and parse its JSON into `Workstream[]` / `DesignProposal`. The seam is already shaped for it.

## Structure

```
src/
  App.tsx                    shell + mode switch
  views/RunConsole.tsx        brief console: brief, board, activity log
  views/WorkspaceView.tsx     project workspace: stage router + stepper
  views/workspace/*           StageInput, Analyze, Decompose, Proposal, Approved
  views/FloorModal.tsx        the floor pop-up
  components/OrgChart.tsx     org chart
  components/FileTree.tsx     project file tree (dimmed ignores)
  components/ModeSwitch.tsx   console ⇄ workspace
  lib/studio.ts               desks, copy, run script
  lib/useRunner.ts            run simulation  (wire real calls here)
  lib/model.ts                OpenAI-compatible adapter
  lib/host/                   HostBridge seam + MockHost + sample projects
  lib/project/                analyze.ts, decompose.ts, proposal.ts (pure)
  lib/workspace/              useWorkspace.ts state machine
  index.css                   design system
```

## Design

Bone paper, warm ink, one ultramarine accent. Colour marks status only — queued, working, delivered. Instrument Serif, Instrument Sans, IBM Plex Mono.
