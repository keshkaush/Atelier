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
# terminal 1 — start the sidecar with the folders you want to expose.
# Pin a token here (otherwise the sidecar generates a random one on boot).
ATELIER_TOKEN=dev ATELIER_ROOTS="/abs/path/to/your/project" npm run host

# terminal 2 — start the app pointed at the local host.
# ATELIER_TOKEN MUST match terminal 1, or the /api proxy is refused.
VITE_HOST=local ATELIER_TOKEN=dev npm run dev
```

Both must be running: the sidecar (`npm run host`) **and** the app with `VITE_HOST=local`. If the app can't reach the sidecar at boot it silently falls back to the mock host (with a console warning) and Step 1 shows the "Use a real folder" card — so a mock card usually means the sidecar isn't up, the token doesn't match, or `VITE_HOST` wasn't set.

**Windows.** The `VAR=value cmd` prefix above is bash/Git Bash syntax. In PowerShell set the vars first:

```powershell
$env:ATELIER_TOKEN="dev"; $env:ATELIER_ROOTS="C:/Users/you/project"; npm run host
$env:VITE_HOST="local"; $env:ATELIER_TOKEN="dev"; npm run dev
```

Use forward slashes (or doubled backslashes) in paths and keep the drive-letter case consistent with what the sidecar prints — a typed `c:/…` won't match an allowlisted `C:\…`.

Env vars:

| Var | Where | Meaning |
| --- | --- | --- |
| `ATELIER_ROOTS` | sidecar | `;`-separated absolute paths it may read/git. Nothing else is reachable. These are what Step 1 offers you to attach. |
| `ATELIER_PORT` | sidecar | Port to bind (default `5179`, loopback only). |
| `ATELIER_TOKEN` | sidecar + vite | Shared secret. Sidecar prints one on boot if unset; Vite injects it on the `/api` proxy so the browser never holds it. |
| `VITE_HOST` | app | `local` selects the sidecar host; unset = mock. |

**Security posture.** The sidecar binds `127.0.0.1` only, requires the token header, and confines every read and git call to `ATELIER_ROOTS` (paths are `realpath`-resolved — including symlinks planted inside a root — and `..` / absolute inputs are rejected). Git runs through `execFile` with argument arrays — never a shell string. Branch creation checks for a dirty tree first and **never auto-stashes**; the only filesystem mutation Atelier itself performs is the opt-in `git checkout -b` you trigger yourself. Analysis, propose, the dry-run diff and the report are all read-only. The one caveat: the QA stage runs *your project's own* `typecheck` / `lint` / `test` scripts, so whatever those scripts do (e.g. a build writing to `dist/`) will happen — that's the project acting, not Atelier, and it only runs when you reach the verification stage.

**If attach fails**, check these in order:

- *"Use a real folder… set `VITE_HOST=local`"* card still shows after you set it → the app fell back to the mock. The sidecar wasn't reachable at boot. Confirm terminal 1 logged `sidecar listening on http://127.0.0.1:5179` and that `VITE_HOST=local` was set on the `npm run dev` process, then reload.
- *"That directory is outside the allowlist"* → the sidecar is up and answering, but the folder you named isn't inside any `ATELIER_ROOTS`. Root cards in Step 1 come straight from the allowlist, so this is either a manually typed path that doesn't match, or the folder you want wasn't passed at boot. Fix it by restarting the sidecar with that folder in `ATELIER_ROOTS` — retyping in the UI won't help. Then click **Re-check roots** (no dev-server restart needed).
- *"Missing or invalid sidecar token"* (or requests silently failing) → `ATELIER_TOKEN` differs between the two terminals. Set the same value in both.
- Diagnose the sidecar directly — health is unauthenticated and reports how many roots loaded: `curl -s http://127.0.0.1:5179/api/health` → `{"ok":true,"roots":1}`. `roots:0` means `ATELIER_ROOTS` never reached the sidecar (usually set in the wrong terminal, or PowerShell syntax used for a bash command). The sidecar also logs the canonical allowlisted paths on boot — attach one of *those*.

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

The project workspace is already wired to the model. Three stages make a call —
**decompose**, **propose** and **implement** — and each one treats the model as
an enhancement rather than a dependency:

| Stage | Model call | Falls back to |
| --- | --- | --- |
| Decompose | `decomposeWithModel` | `decompose` (rule-based splitter) |
| Propose | `buildProposalWithModel` | `buildProposal` |
| Implement | `generateImplementationWithModel` | `generateImplementation` |

If no key is set, or the reply is empty / malformed / times out, the stage
falls back to its deterministic path and the UI shows a **deterministic** note
saying so. A stage never fails because a model did.

The safety invariant: **the model never chooses a path.** Candidate files are
computed locally (and filtered through the shared ignore manifest), the model
is handed those files' current contents, and any path it returns that was not
offered is discarded. Diffs are always re-derived locally from full file text —
hunks are displayed, never parsed back into a file.

> `VITE_` values are exposed in the browser bundle. For anything public, proxy the request through a small backend so the key stays server-side.

## Project workspace

The project-aware flow runs a nine-step journey. The first half is analysis-first and writes nothing; the second half produces a reviewable diff that is written only when you explicitly confirm it:

1. **Brief + attach** — describe the change and attach a project directory. In demo mode you pick a canned sample; in local mode (`VITE_HOST=local`) the sidecar offers the folders it was started with (`ATELIER_ROOTS`), or you type an absolute path — which the host only accepts if it's inside that allowlist. No arbitrary filesystem browsing.
2. **Analyse** — structural detection of framework, styling, components, tokens and themes, each claim backed by the files that prove it. Dependencies, build output, lockfiles, secrets and binaries are never crawled (the ignored tally is shown explicitly).
3. **Decompose** — the brief split into workstreams, one per desk, grounded in the real paths each will touch.
4. **Propose** — a versioned high-level design proposal: requirement understanding, proposed design, a schematic wireframe preview, and implementation impact.
5. **Decide** — approve, revise (new version), choose an alternative (new version), or cancel.
6. **Branch prep** — opt-in, off by default. An editable branch name (pre-filled from a slug of the brief, validated live), a dirty-tree warning that requires acknowledgement, and the current branch / ahead-behind. Copy states plainly that **Atelier never stashes your changes**.
7. **Final approval** — the last gate before any file work: proposal version, branch (or none), impact counts, and an explicit "begin implementation".
8. **Implementation + apply gate** — a deterministic, reviewable per-file diff shaped from the plan and your project's real files. Accept or skip each file; that decision is **provisional**. A separate confirmation screen freezes exactly the accepted files and lists what will be created vs. overwritten. Only pressing **Write to disk** there sends anything to the host. Every file is re-checked against the exact contents the proposal was generated from — if anything changed on disk in the meantime, **nothing is written** and the conflicting paths are listed. Return to review and the frozen batch is discarded.
9. **QA / verification** — runs the target project's own typecheck (`tsc -b` / a `typecheck` script), plus lint and tests if declared. Degrades gracefully when a check can't run on the host platform. Reports a verdict, per-step results, and a change summary that always states truthfully what was written (real write / simulated / nothing), with timestamp.

Two routes mutate anything, and both are opt-in: the `git checkout -b` from step 6, and the apply confirmed at step 8. The write path never commits, stages, or stashes — after a successful apply, review the changes in git yourself.

**Apply safety.** `POST /api/apply` accepts at most 8 edits of 400 KB each. Paths must be plain, project-relative and POSIX-separated — no absolute/drive/UNC paths, backslashes, dot segments, NUL, colons, `.git` components, Windows reserved names, or names ending in a dot/space — and must resolve inside the allowlisted root through real directories (symlinks, junctions and non-regular files are refused). The whole batch is validated and preflighted before a single byte moves; each file is then staged to an exclusive temp file beside its target, re-verified, and published by rename (replace) or exclusive create (a file that appeared mid-batch is never clobbered). This is deliberately **not** atomic across files: a failure mid-batch is reported as `partial` with the exact paths written, and nothing is rolled back (rewriting a file could destroy a concurrent edit). Conflicts before any write leave the tree untouched.

**Host seam.** A browser can't read a folder or run `git`, so all filesystem/git access goes through one interface — `HostBridge` in `src/lib/host/` (`listProject`, `gitStatus`, `createBranch`, `readFile`, `verify`, `applyEdits`). Two implementations: `MockHost` (canned sample projects, offline — it reports applies as *simulated* and never touches disk) and `LocalHost` (the `server/` Node sidecar behind `/api`). Because the analysis engine consumes only a `DirListing` and the diff shaper only a file's text, the same frontend runs unchanged against either — pick with `VITE_HOST`.

**Wiring a real model.** `src/lib/project/decompose.ts` and `proposal.ts` are deterministic by default (offline, instant), as is the generator `implement.ts`. To generate any of them with a model instead, call `complete()` from `src/lib/model.ts` with the relevant mandate as the system prompt and the brief + analysis as the user message, and parse its JSON into `Workstream[]` / `DesignProposal` / a set of `FileEdit`s (complete `content` plus the exact `original`, or `null` for a new file). The seam is already shaped for it — the rest of the pipeline (diff rendering, review, apply, QA) is unchanged, and hunks are only ever displayed, never used to reconstruct a file.

## Structure

```
src/
  App.tsx                    shell + mode switch
  views/RunConsole.tsx        brief console: brief, board, activity log
  views/WorkspaceView.tsx     project workspace: stage router + stepper
  views/workspace/*           StageInput, Analyze, Decompose, Proposal, Approved,
                              BranchPrep, FinalApprove, Review (+DiffView), Apply, QA
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
  index.mjs                   HTTP server: /api/health, roots, list, git-status, branch, read, verify, apply
  lib/                        allowlist, walk, git, branch, apply (write-on-confirm), verify
  test/                       host tests (throwaway /tmp git repos + a real HTTP sidecar)
scripts/test-machine.mjs      compile + run the reducer suite
```

## Design

Bone paper, warm ink, one ultramarine accent. Colour marks status only — queued, working, delivered. Instrument Serif, Instrument Sans, IBM Plex Mono.
