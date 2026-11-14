# Atelier

An agentic design studio. You brief one **Design Lead**, who splits the work across five specialist desks and reviews what they return.

Two peer modes, switched from the top bar:

- **Project workspace** (home): point the studio at a *real project directory*, describe a change, and get a versioned high-level design proposal to approve, revise, or switch — analysis-first, nothing written until you approve.
- **Brief console**: write a brief, dispatch it, watch the desks work — the scripted simulation.

**The floor** (pop-up): the org chart, studio stats, and roster — reachable from both modes.

> The brief console is a scripted simulation. The workspace runs against a **mock host** by default (offline, no filesystem access) or a **real local host** — a zero-dependency Node sidecar that reads a real folder and runs git. To make either live, attach a model and (for the workspace) start the sidecar — see below.

## Run

```bash
npm install
npm run dev      # http://localhost:5178
npm run build
```

Requires Node 18+.

### Real host (optional)

The workspace can read a **real project directory** and run **real git** instead of the mock. This is a local Node sidecar; the browser never touches the filesystem directly.

```bash
# terminal 1 — start the sidecar with the folders you want to expose
ATELIER_ROOTS="/abs/path/to/your/project" npm run host

# terminal 2 — start the app pointed at the local host
VITE_HOST=local ATELIER_TOKEN=<token the sidecar printed> npm run dev
```

Env vars:

| Var | Where | Meaning |
| --- | --- | --- |
| `ATELIER_ROOTS` | sidecar | `;`-separated absolute paths it may read/git. Nothing else is reachable. |
| `ATELIER_PORT` | sidecar | Port to bind (default `5179`, loopback only). |
| `ATELIER_TOKEN` | sidecar + vite | Shared secret. Sidecar prints one on boot if unset; Vite injects it on the `/api` proxy so the browser never holds it. |
| `VITE_HOST` | app | `local` selects the sidecar host; unset = mock. |

**Security posture.** The sidecar binds `127.0.0.1` only, requires the token header, and confines every read and git call to `ATELIER_ROOTS` (paths are `realpath`-resolved; `..` and absolute inputs are rejected). Git runs through `execFile` with argument arrays — never a shell string. Branch creation checks for a dirty tree first and **never auto-stashes**; the only filesystem mutation in the whole app is the opt-in `git checkout -b` you trigger yourself. Everything else — analysis, propose, the dry-run diff, QA — is read-only.

Host tests (any OS with git + node):

```bash
npm run test:host      # sidecar: walk, git-status, branch, allowlist, verify
npm run test:machine   # reducer transitions across all nine stages
npm test               # both
```

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

The project-aware flow runs a nine-step journey. The first half is analysis-first and writes nothing; the second half is a reviewable dry run that still writes nothing:

1. **Brief + attach** — describe the change and attach a project directory.
2. **Analyse** — structural detection of framework, styling, components, tokens and themes, each claim backed by the files that prove it. Dependencies, build output, lockfiles, secrets and binaries are never crawled (the ignored tally is shown explicitly).
3. **Decompose** — the brief split into workstreams, one per desk, grounded in the real paths each will touch.
4. **Propose** — a versioned high-level design proposal: requirement understanding, proposed design, a schematic wireframe preview, and implementation impact.
5. **Decide** — approve, revise (new version), choose an alternative (new version), or cancel.
6. **Branch prep** — opt-in, off by default. An editable branch name (pre-filled from a slug of the brief, validated live), a dirty-tree warning that requires acknowledgement, and the current branch / ahead-behind. Copy states plainly that **Atelier never stashes your changes**.
7. **Final approval** — the last gate before any file work: proposal version, branch (or none), impact counts, and an explicit "begin implementation".
8. **Implementation (dry run)** — a deterministic, reviewable per-file diff shaped from the plan and your project's real files. Accept or skip each file (plan membership only). **Nothing is applied** — you take the diff into your editor.
9. **QA / verification** — runs the target project's own typecheck (`tsc -b` / a `typecheck` script), plus lint and tests if declared. Degrades gracefully when a check can't run on the host platform. Reports a verdict, per-step results, and a change summary, with timestamp.

The only filesystem mutation anywhere is the opt-in `git checkout -b` from step 6. Nothing else — not the diff, not QA — writes.

**Host seam.** A browser can't read a folder or run `git`, so all filesystem/git access goes through one interface — `HostBridge` in `src/lib/host/` (`listProject`, `gitStatus`, `createBranch`, `readFile`, `verify`). Two implementations: `MockHost` (canned sample projects, offline) and `LocalHost` (the `server/` Node sidecar behind `/api`). Because the analysis engine consumes only a `DirListing` and the diff shaper only a file's text, the same frontend runs unchanged against either — pick with `VITE_HOST`.

**Wiring a real model.** `src/lib/project/decompose.ts` and `proposal.ts` are deterministic by default (offline, instant), as is the dry-run generator `implement.ts`. To generate any of them with a model instead, call `complete()` from `src/lib/model.ts` with the relevant mandate as the system prompt and the brief + analysis as the user message, and parse its JSON into `Workstream[]` / `DesignProposal` / a set of edits. The seam is already shaped for it — the rest of the pipeline (diff rendering, review, QA) is unchanged.

## Structure

```
src/
  App.tsx                    shell + mode switch
  views/RunConsole.tsx        brief console: brief, board, activity log
  views/WorkspaceView.tsx     project workspace: stage router + stepper
  views/workspace/*           StageInput, Analyze, Decompose, Proposal, Approved,
                              BranchPrep, FinalApprove, Review (+DiffView), QA
  views/FloorModal.tsx        the floor pop-up
  components/OrgChart.tsx     org chart
  components/FileTree.tsx     project file tree (dimmed ignores)
  components/ModeSwitch.tsx   console ⇄ workspace
  lib/studio.ts               desks, copy, run script
  lib/useRunner.ts            run simulation  (wire real calls here)
  lib/model.ts                OpenAI-compatible adapter
  lib/host/                   HostBridge seam + MockHost + LocalHost + samples
  lib/project/                analyze.ts, decompose.ts, proposal.ts, diff.ts, implement.ts (pure)
  lib/workspace/              machine.ts (pure reducer) + useWorkspace.ts + tests
  index.css                   design system
server/                       zero-dep Node sidecar (the real local host)
  index.mjs                   HTTP server: /api/list, git-status, branch, read, verify
  lib/                        allowlist, walk, git, branch, verify
  test/                       host tests (throwaway /tmp git repos)
scripts/test-machine.mjs      compile + run the reducer suite
```

## Design

Bone paper, warm ink, one ultramarine accent. Colour marks status only — queued, working, delivered. Instrument Serif, Instrument Sans, IBM Plex Mono.
