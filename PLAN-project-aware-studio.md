# Plan — Project-Aware Design Studio

**Branch:** `feature/project-aware-design-studio` (created off `main`; working tree clean).
**Milestone:** 1 of the feature — the *analysis → proposal* arc (steps 1–5). Branch prep, implementation, and QA report are a following milestone.
**Hard principle:** the studio *analyzes and proposes first*. Nothing on disk is ever modified before an explicit approval.

---

## 1. The problem, stated precisely

Atelier today is a scripted demo: you type a brief, five desks animate a canned timeline, artifacts appear. It never touches a real project.

The request turns it into a **project-aware** studio: you attach an actual project directory plus a natural-language brief; the studio reads the project, understands it, decomposes the work semantically, and returns a **versioned high-level design proposal** — which you approve, revise, ask for alternatives on, or cancel. Only after approval does anything move toward implementation (later milestone).

The nine-step journey, with Milestone 1's boundary marked:

```
1  Natural-language input + project-directory attachment   ┐
2  Project analysis (framework · components · tokens · themes, strict ignores) │
3  Semantic decomposition                                   ├─ MILESTONE 1
4  High-level design proposal (preview, impact, decisions)  │
5  Versioned proposal (approve / revise / alternatives / cancel)               ┘
6  Git branch preparation (opt-in, editable name, dirty-tree warnings)  ┐
7  Final approval                                                        ├─ MILESTONE 2
8  Implementation                                                        │
9  QA / verification report                                             ┘
```

The constraint that shapes everything: **a browser SPA cannot read a folder or run `git`.** The current app is pure client-side React + Vite. Per your call, Milestone 1 builds the full experience against a **pluggable host seam** with a **mock host** behind it — so the entire journey runs offline today, and a real filesystem/git adapter (a local Node companion or Tauri, like the OpenJarvis shell) slots in later without touching the UI. This mirrors exactly how `model.ts` already sits behind a seam: real when configured, simulated by default.

---

## 2. Decisions you made (baked into this plan)

- **Host layer → Mock host first.** All disk/git access goes through one `HostBridge` interface. A `MockHost` serves canned sample projects. Real fs+git is a future adapter — same interface, no UI change.
- **Scope → Analysis → proposal first.** Steps 1–5 only. The proposal's *decisions* still include "proceed to branch prep," but that action is a stub that says "Milestone 2" — the state machine is built to accept stage 6+ without rework.
- **Placement → New workspace mode.** A top-level switch: the existing brief-driven **Run console** stays home; a new **Project workspace** is a peer mode. *The floor* modal stays reachable from both. Nothing in `RunConsole` or the simulation is torn out.

---

## 3. Architecture

### 3.1 New module map

```
src/
  App.tsx                     ← gains a mode switch (console ⇄ workspace)
  lib/
    host/
      types.ts                ← HostBridge, DirEntry, DirListing, GitStatus, AttachedProject
      mockHost.ts             ← MockHost: canned sample projects, fake fs reads
      samples.ts              ← 2–3 sample projects (a real Vite app, a plain HTML site, a DS-flavored repo)
    project/
      analyze.ts              ← PURE: DirListing → ProjectAnalysis (framework, components, tokens, themes, ignored)
      decompose.ts            ← brief + analysis → Workstream[] (semantic split)
      proposal.ts             ← analysis + workstreams → DesignProposal (versioned); impact + alternatives
    workspace/
      useWorkspace.ts         ← state machine hook (the "runner" for this mode)
  views/
    WorkspaceView.tsx         ← the workspace shell + stage routing
    workspace/
      StageInput.tsx          ← brief + attach-directory (sample picker in mock)
      StageAnalyze.tsx        ← file tree + detected-stack report
      StageDecompose.tsx      ← workstreams as they form
      StageProposal.tsx       ← THE proposal screen (below)
      ProposalPreview.tsx      ← wireframe/visual preview block
      VersionRail.tsx         ← v1 / v2 / v3 … history + diff note
  components/
    FileTree.tsx              ← tiny directory tree (reused in analyze + attach)
    ModeSwitch.tsx            ← header segmented control
```

Everything new is additive. The only edits to existing files are `App.tsx` (mode shell), `index.css` (append new blocks on existing tokens), and `README.md`.

### 3.2 The HostBridge seam (the load-bearing abstraction)

```ts
// src/lib/host/types.ts
export interface DirEntry {
  name: string;
  path: string;            // relative to project root
  kind: 'file' | 'dir';
  ext?: string;            // '.tsx', '.css', …
  size?: number;
}

export interface DirListing {
  root: string;            // display name only — mock never exposes a real absolute path
  entries: DirEntry[];     // already filtered to a sane depth
  truncated?: boolean;
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  dirty: boolean;          // uncommitted changes present
  ahead?: number;
  behind?: number;
}

/** The single surface the UI talks to. Real host = second implementation. */
export interface HostBridge {
  readonly kind: 'mock' | 'local';
  listProject(root: string): Promise<DirListing>;
  gitStatus(root: string): Promise<GitStatus>;
  /** Milestone 2. Present now so the state machine is shaped for it; mock returns a dry-run note. */
  createBranch(root: string, name: string): Promise<{ ok: boolean; branch?: string; note?: string }>;
}
```

`MockHost` implements all three against `samples.ts`. Because `analyze.ts` consumes only a `DirListing`, **the same analysis engine will run against a real folder** the day a local adapter lands — that's the payoff of the seam.

### 3.3 Analysis engine — `analyze.ts` (pure, no I/O)

Input: a `DirListing`. Output:

```ts
export interface ProjectAnalysis {
  framework: { name: string; confidence: 'high' | 'med' | 'low'; evidence: string[] }[];
  styling: { name: string; evidence: string[] }[];       // Tailwind, CSS Modules, styled-components, plain CSS…
  components: { count: number; samples: string[] };      // .tsx/.jsx/.vue/… files found
  tokens: { files: string[]; signals: string[] };        // tokens.css, theme.ts, tailwind.config, CSS custom props
  themes: { name: string; evidence: string[] }[];        // dark/light, theme providers, prefers-color-scheme
  ignored: { count: number; reasons: Record<string, number> };
  summary: string;                                        // one editorial line, e.g. "React 18 · Vite · Tailwind v4"
}
```

**Strict ignore rules** (the spec calls these out) are a single exported list, applied in `analyze.ts` *and* surfaced as human-readable counts on the Analyze stage:

- `node_modules/`, `.git/`, `dist/`, `build/`, `.next/`, `.turbo/`, `coverage/`
- lockfiles: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`
- env & secrets: `.env`, `.env.*` (except `.env.example`), `*.pem`, `*.key`
- binaries/media: images, fonts, video, archives, `*.map`
- anything over a depth cap (mock listings are pre-trimmed; the rule is documented for the real host)

Detection is **heuristic and evidence-bearing** — every claim lists the files that prove it (e.g. `framework: React 18` ← `package.json` dependency + `src/main.tsx`). This is what makes the Analyze stage feel real rather than a lie. It is deterministic and unit-checkable against the canned samples; a real model can later *narrate* the analysis but the structural detection stays local and cheap.

### 3.4 Decomposition — `decompose.ts`

Turns `(brief, analysis)` into `Workstream[]`, each mapped to one of the five existing desks (research / ux / ui / content / ops) so the feature *reuses the studio's identity* rather than inventing a parallel vocabulary:

```ts
export interface Workstream {
  id: string;
  desk: DeskId;            // reused from studio.ts
  title: string;
  scope: string;
  touches: string[];       // real paths from the DirListing this stream will affect
  risk: 'low' | 'med' | 'high';
}
```

In Milestone 1 this is a rule-based splitter (deterministic, demoable). It is a clean seam to swap for a `model.ts` call: `complete(cfg, [{role:'system', content: LEAD.mandate}, {role:'user', content: brief + analysisJSON}])` returns JSON workstreams. The plan wires the seam but defaults to the rule-based path so the demo stays offline and instant, exactly like `useRunner` today.

### 3.5 Proposal + versioning — `proposal.ts`

```ts
export interface DesignProposal {
  version: number;                 // 1, 2, 3…
  createdAt: number;
  requirement: string[];           // "requirement understanding" — restated, checkable
  design: { headline: string; body: string; structure: string[] };
  preview: PreviewBlock[];         // simple wireframe blocks for ProposalPreview
  impact: { files: string[]; adds: number; edits: number; removes: number; notes: string[] };
  workstreams: Workstream[];
  alternatives?: { id: string; label: string; tradeoff: string }[];
  changeNote?: string;             // what changed vs previous version ("revise" / "alternative")
}

export type Decision =
  | { kind: 'approve' }
  | { kind: 'revise'; instruction: string }
  | { kind: 'alternative'; id: string }
  | { kind: 'cancel' };
```

A decision returns a **new** `DesignProposal` object (immutable) — never mutates the prior one — so the `VersionRail` is an honest history. `approve` is the *only* transition that can lead toward implementation, and in Milestone 1 it lands on an "Approved — branch preparation is next (Milestone 2)" holding state. **No file writes exist anywhere in this milestone.**

### 3.6 State machine — `useWorkspace.ts`

Mirrors the shape of `useRunner` (a hook the view consumes) but event-driven rather than timer-driven:

```
input ──attach+brief──▶ analyzing ──▶ analyzed
                                        │
                              decompose ▼
                                     decomposing ──▶ proposal(v1)
                                                          │
                        ┌───────────── revise ────────────┤
                        │            alternative ──────────┤  (each produces v(n+1))
                        │            approve ──────────────┴──▶ approved (stub → M2)
                        └────────────────────────── cancel ──▶ idle
```

State exposes: `stage`, `analysis?`, `workstreams?`, `proposal?`, `versions[]`, `error?`, and actions `attach()`, `setBrief()`, `analyze()`, `decompose()`, `decide()`, `reset()`. Analysis/decompose are `async` (the seam is async even though mock resolves instantly) so swapping in a real host is a no-op for callers. A small artificial delay + status transitions reuse the existing `.dot--working` pulse so it reads as work happening.

---

## 4. UI / design

The feature must **look native to Atelier**, not bolted on. It reuses the existing editorial system verbatim — bone paper `#EDEAE1`, ink, the single ultramarine `#2433B0` reserved for status, hairline rules, Instrument Serif/Sans + IBM Plex Mono — and reuses existing classes wherever possible: `.wrap .masthead .runbar .desk-card .ledger .colophon .dialog .scrim .btn .preset .dot`.

New screens, stage by stage:

**Input (`StageInput`).** Extends the composer idiom. Textarea for the brief (same `.composer` field styling) + an attach affordance. In mock mode "attach" is a `preset`-styled row of sample projects (a Vite React app, a plain static site, a design-system repo). Once a real host exists this same slot becomes a native folder picker. Shows the chosen project's name + a "not a git repo / clean / dirty" chip from `gitStatus` (dirty uses `--st-warn`).

**Analyze (`StageAnalyze`).** A two-column `.run`-style layout: left = a compact `FileTree` of the listing; right = the detected-stack report as a `.desk-card`-flavored panel — framework/styling/components/tokens/themes each with their evidence chips (`.node__chip`), plus an **"Ignored" ledger row** showing counts by reason (node_modules ×1, lockfiles ×2, env ×3…). This makes the strict-ignore rule *visible*, which is the trust-building part of the step. A `runbar` strip shows files scanned / ignored / components found.

**Decompose (`StageDecompose`).** Workstreams appear as `.desk-card`-styled rows grouped by desk, each with its `touches` paths (mono) and a risk dot (low=queued grey, med=working ultramarine, high=warn). Reads like the Lead splitting the brief across the floor — continuity with the existing board.

**Proposal (`StageProposal`) — the centerpiece.** Structured like a magazine feature, not a chat reply:

1. *Requirement understanding* — a numbered restatement in serif, each line tagged with a confidence chip. This is the "did we hear you correctly" gate.
2. *Proposed design* — headline + body + a structure list.
3. *Visual preview* — `ProposalPreview`: wireframe blocks drawn with hairlines (schematic, on-brand — not a screenshot), responsive-ish blocks showing layout intent.
4. *Implementation impact* — counts (adds/edits/removes) as a `.colophon`-style strip + the affected `files` list; explicit "no files modified yet" reassurance line.
5. *Decision bar* — four `.btn` actions: **Approve** (solid), **Revise** (opens an instruction field), **Alternatives** (if `alternatives` present, chips to switch), **Cancel** (ghost). Pinned; keyboard-reachable; destructive-ish actions confirm.
6. *Version rail* — `VersionRail` along the edge: v1, v2… each with its `changeNote`; clicking a past version shows it read-only with a "return to latest" affordance. Honest history, no hidden mutation.

**Shell (`App.tsx`).** A `ModeSwitch` segmented control in the masthead area: "Brief console" ⇄ "Project workspace." The floor button + `FloorModal` remain available in both. The URL-less mode lives in `App` state (this app has no router; adding one is out of scope). `RunConsole` is untouched — it simply renders when mode = console.

---

## 5. Files changed / added

**Add (≈13 new files):** the `lib/host/*`, `lib/project/*`, `lib/workspace/*`, `views/workspace/*`, `components/FileTree.tsx`, `components/ModeSwitch.tsx` listed in §3.1.
**Edit (3):** `src/App.tsx` (mode shell), `src/index.css` (append: `.mode-switch`, `.workspace`, `.stage`, `.proposal*`, `.preview*`, `.version-rail`, `.file-tree` — all built on existing tokens), `README.md` (new "Project-aware workspace" section; note the mock→real host path).
**Untouched:** `studio.ts`, `useRunner.ts`, `model.ts`, `RunConsole.tsx`, `FloorModal.tsx`, `OrgChart.tsx`, `Icons.tsx` (add 2–3 icons: folder, git-branch, check), `main.tsx`, configs.

---

## 6. Build order (each step compiles + is reviewable on its own)

- **M1-A — HostBridge seam + MockHost + samples.** Types, mock host, 2–3 realistic sample projects. Everything downstream depends only on `DirListing`, so this lands first and unblocks the rest.
- **M1-B — `analyze.ts`.** Pure detection + ignore rules; verify against the samples (React app → React/Vite/Tailwind high-confidence; static site → plain HTML/CSS; DS repo → tokens/themes found).
- **M1-C — `decompose.ts`, `proposal.ts`, `useWorkspace.ts`.** The state machine + versioning + decision handling; approve lands on the M2 stub.
- **M1-D — Workspace view + stage components + preview + version rail.** The look.
- **M1-E — `ModeSwitch` in `App.tsx` + CSS + README.** Integrate without disturbing the console.
- **M1-F — Verification** (below).

---

## 7. Verification

- `tsc -b` passes (the real type-gate that runs in this sandbox; note `vite build` needs Windows rollup binaries and runs on your machine, per the known env constraint — npm/registry is blocked here).
- **Principle check:** grep the new code for any `writeFile`, `fs.` write, `createBranch` call on the happy path — none may exist outside the M2 stub. The approval transition must stop at a holding state.
- **Analysis sanity:** assert the three samples produce the expected framework/token/theme signals and that ignored counts ignore `node_modules`, lockfiles, and `.env*` as specified.
- **State machine:** walk every edge — input→analyze→decompose→proposal; revise twice (v1→v2→v3); alternative (new version); cancel (returns to input); approve (holding state). No version mutates a prior one.
- **UI states:** status dots only use queued/working/done; risk uses warn; dirty-tree chip uses warn; confirm destructive actions; keyboard-reachable decision bar; floor modal still opens from the workspace.

---

## 8. Explicitly deferred to Milestone 2 (so scope is honest)

Real filesystem & real `git` adapter (`LocalHost` behind the same `HostBridge`); branch-preparation UI (editable name, dirty-tree warnings, *never auto-stash*); final approval gate; implementation execution with diff review; QA/verification report. The state machine and proposal decisions are shaped now to accept these without rework — `approve` already has a named landing slot.

## 9. Open questions for you (non-blocking — I'll pick sensible defaults if you wave them through)

1. **Sample projects** — good set to ship? A Vite+React+Tailwind app, a plain HTML/CSS static site, and a design-system repo (tokens + themes). This exercises every detector branch.
2. **Proposal generation** — rule-based/deterministic (offline, instant, demoable) as default, with the `model.ts` seam wired but off — matching today's simulation. Good?
3. **Approval landing** — for M1, approve shows an "Approved · branch prep comes next (Milestone 2)" holding card. Acceptable, or would you rather approve simply close the loop with a summary?
```
