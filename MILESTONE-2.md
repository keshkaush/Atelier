# Milestone 2 — Real host, branch prep, implementation, QA

> **For a fresh session:** read this whole file first, then `PLAN-project-aware-studio.md`, then `src/lib/workspace/machine.ts` and `src/lib/host/types.ts`. This document is self-contained.

## Where things stand (verify before starting)

- **Branch:** `feature/project-aware-design-studio` (created off `main`).
- **Git state:** ⚠️ **NOTHING IS COMMITTED YET** beyond `51d3372 Initial commit`. All of M1 + the state-machine refactor + the "workspace as home" change are **uncommitted working-tree changes**. First action is to commit them (see Phase 0).
- **M1 shipped:** the full analysis→proposal arc (steps 1–5) against a `MockHost`. App now lands on the workspace. Tests last green: `tsc -b` exit 0; reducer 25/25; analyze 27/27; decompose/proposal 48/48; journey 10/10.
- **The seam is ready:** every disk/git call goes through `HostBridge` (`src/lib/host/types.ts`). M2 = implement a *real* `LocalHost` behind that same interface + build stages 6–9.

## Environment facts (learned the hard way — saves hours)

- `node_modules` **is** present (React 18.3.1, vite, typescript). But **every native binary is `win32-x64`** (tree copied from Windows): no `@rollup/rollup-linux-x64-gnu`, esbuild only `@esbuild/win32-x64`. ⇒ `vite build` **and** `vite dev` **crash in-sandbox**. `npm i` of the Linux binaries is blocked (registry **403**).
- **Authoritative frontend check = `./node_modules/.bin/tsc -b`** (real React types, real tsconfig) — passes. Full build runs on the user's Windows machine.
- **Git 2.34.1 and Node 22 ARE available in-sandbox.** ⇒ the **M2 backend (fs + git + child_process) is fully testable here.** Unit-test the host layer against throwaway git repos in `/tmp` (never in the mounted repo).
- Mount blocks some delete ops and occasionally shows a stale `node_modules` view — re-check with `ls` before concluding a dep is missing.

## Decisions needed before Phase 2 (recommended defaults in **bold**)

1. **Host transport.** **Local Node sidecar** (standalone `server/` process, Vite proxies `/api` to it) vs. Tauri native commands. Sidecar is far cheaper and testable here; Tauri is the eventual OpenJarvis-aligned home. **Default: Node sidecar now; keep `HostBridge` shaped so a Tauri adapter can replace it later.**
2. **Implementation execution.** (a) **Dry-run only** — generate a proposed diff, show it for review, never write (safest; completes the loop honestly). (b) **Write-on-confirm** — apply the reviewed diff to disk through the host after explicit per-change approval. **Default: dry-run diff for M2; write-on-confirm is M3.** Rationale: writing files is the highest-risk step; prove the review UX first with zero blast radius.
3. **What generates the implementation.** Deterministic/scripted (offline, like M1) vs. real `model.ts` calls. **Default: deterministic diff-shaping, with the `model.ts` seam wired but off** — matches the "offline by default" philosophy across the app.
4. **QA scope.** Run what the project actually has: `tsc -b` always; `lint`/`test` if present. **Default: typecheck + a structured report of what changed; skip anything that needs the Windows-only build.**

---

## Phase 0 — Commit the existing work (do first)

- [ ] `git add -A && git commit` M1 + refactor + home change in **one or two logical commits** on `feature/project-aware-design-studio`. Suggested split: (a) "Project-aware workspace (M1): host seam, analysis, proposal arc"; (b) "Refactor implicit state machines; workspace as home".
- [ ] Confirm `git status` clean and `tsc -b` still exit 0.
- [ ] (User, on their machine) `git push -u origin feature/project-aware-design-studio`.
- [ ] Decide: does M2 continue on this branch or a new `feature/milestone-2-host` off it? **Default: continue on the same branch** (it's one feature).

## Phase 1 — LocalHost backend (`server/`)

Goal: a real `HostBridge` implementation that reads a directory and runs git safely.

- [ ] New `server/` dir (not under `src/`). Pick transport: **Express** (add dep — but registry 403 in-sandbox ⇒ if you can't install, use Node's built-in `node:http`, zero deps; **prefer zero-dep `node:http`**). Start: `node server/index.mjs` on `127.0.0.1:5179`.
- [ ] Endpoints mirroring the interface:
  - `GET /api/list?root=<abs>` → bounded `DirListing` (walk with a **depth cap** ≈ 6 and an **entry cap** ≈ 5000; do NOT apply ignore rules here — `analyze.ts` owns them; just don't descend into `node_modules`/`.git` to keep the walk cheap).
  - `GET /api/git-status?root=<abs>` → `GitStatus` via `git status --porcelain=v2 --branch` (parse `# branch.head`, dirty = any non-`#` line).
  - `POST /api/branch` `{root, name}` → **dirty-tree check first**; return `{ok:false, dirty:true, note}` if dirty and caller didn't opt in; else `git checkout -b <name>`. **NEVER auto-stash.** Validate branch name against `/^[a-z0-9][a-z0-9._/-]*$/i`.
- [ ] **Security (non-negotiable):** bind `127.0.0.1` only; require a random token header the sidecar prints on boot and Vite passes via proxy env; resolve+`realpath` the `root` and **reject anything outside an allowlist** the user explicitly chose (no arbitrary path reads). Use `execFile('git', ['-C', root, ...])` with **arg arrays** — never a shell string (injection). Reject paths containing `..` after realpath.
- [ ] `LocalHost` in `src/lib/host/localHost.ts` implementing `HostBridge` (`kind:'local'`) via `fetch('/api/...')`. `src/lib/host/index.ts` selects host by env (`VITE_HOST=local`) with a graceful fallback to `mockHost`.
- [ ] Vite `server.proxy` for `/api` → `127.0.0.1:5179`.
- [ ] **Tests (runnable in-sandbox):** in `/tmp`, `git init` throwaway repos; assert list returns entries, git-status detects clean vs dirty, branch creation works and is refused on dirty without opt-in, and path-traversal/allowlist rejections fire.

## Phase 2 — Extend the state machine for 6–9

- [ ] In `src/lib/workspace/machine.ts` add stages after `approved`: `branch-prep`, `implementing`, `review`, `qa`, `complete` (rename `approved`→ entry into `branch-prep`, or keep `approved` as the branch-prep screen). Add actions: `OPEN_BRANCH_PREP`, `BRANCH_PREP_OK`, `BEGIN_IMPLEMENT`, `IMPLEMENT_OK`, `APPROVE_FINAL`, `QA_DONE`, `BACK_*` equivalents.
- [ ] Keep the **reducer pure + guarded** (same pattern: illegal events from wrong stages are ignored). Add reducer tests for the new edges (aim to keep the 25/25 suite green + new cases).
- [ ] Selectors for the new derived values (e.g. `canCreateBranch`).

## Phase 3 — Stage 6: Branch preparation UI

- [ ] `src/views/workspace/StageBranchPrep.tsx`. Reuse editorial classes. Contents:
  - Opt-in toggle ("Create a branch for this change") — **default off**.
  - **Editable** branch name, pre-filled from a slug of the brief (`feat/`+slug). Validate live against the same regex; show inline error.
  - **Dirty-tree warning panel** (uses `gitStatus.dirty`): explain plainly, require an explicit acknowledgement checkbox; copy must state **"Atelier never stashes your changes."**
  - Current branch + ahead/behind shown.
  - Actions: Create branch (calls `host.createBranch`) → on ok advance; Skip (proceed without a branch) → allowed with its own warning.
- [ ] Wire into `WorkspaceView` step router + stepper (already has 5 steps; extend tracker to the new stages).

## Phase 4 — Stage 7: Final approval gate

- [ ] A distinct confirmation screen summarizing: proposal version approved, branch (or "no branch"), impact counts. Explicit **Final approve → Begin implementation**. This is the last gate before any file work.

## Phase 5 — Stage 8: Implementation (dry-run diff by default)

- [ ] Deterministic diff-shaping from `proposal.workstreams` + real file contents (read the touched files through the host; produce a reviewable old→new diff per file). **No writes.**
- [ ] `src/views/workspace/StageReview.tsx`: per-file diff cards, accept/skip per file (UI state only), summary. Copy states plainly that nothing is applied in this milestone.
- [ ] If/when going to write-on-confirm (M3): route writes through a new `HostBridge.applyEdit(root, edits[])` — keep it a SEPARATE, later decision.

## Phase 6 — Stage 9: QA / verification report

- [ ] `src/views/workspace/StageQA.tsx` + a host endpoint `POST /api/verify` that runs `tsc -b` (always) and `lint`/`test` if the target project has those scripts. **Note:** in-sandbox `tsc -b` for the *target* project will hit the win32-binary issue if the target is this repo — run verification against the chosen project, and degrade gracefully (report "could not run, platform").
- [ ] Report: typecheck result, files changed, workstream verdict, timestamp. Editorial styling, status-colour only.

## Phase 7 — Verification & docs

- [ ] `./node_modules/.bin/tsc -b` exit 0 (frontend). Host layer unit tests green (in-sandbox). Reducer suite green with new stages.
- [ ] Grep-audit again: no file-write/`git` execution on any path **before** final approval; the only writers are behind explicit confirm actions in the host layer.
- [ ] Update README (`server/` section, env vars, security note) and the machine ASCII diagram in `machine.ts`.
- [ ] Update memory `project_atelier_studio.md` with M2 outcome + any new env facts.

## Definition of done for M2

A user can: attach a **real** directory → analyse it → decompose → propose → approve → choose (or skip) a branch with dirty-tree safety → final-approve → see a **reviewable dry-run diff** → get a **QA report** — with **zero** disk mutation before final approval and **never** an auto-stash. `tsc -b` green, host + reducer tests green.
