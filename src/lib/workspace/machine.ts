/* ============================================================
   The workspace state machine — pure, no React, no I/O.

   One explicit machine replaces the scattered setStage() calls in
   the old hook. State is a single object; every transition is an
   action flowing through `workspaceReducer`. `busy` and the
   displayed proposal are DERIVED (selectors), never stored — so
   there is one source of truth, not several that can desync.

   Stage graph:

     input ──ATTACH──▶ input        (attaches project; still stage input)
     input ──BEGIN_ANALYSIS──▶ analyzing
     analyzing ──ANALYSIS_OK──▶ analyzed
     analyzing ──ANALYSIS_FAIL──▶ input (error set)
     analyzed ──BEGIN_DECOMPOSE──▶ decomposing
     decomposing ──DECOMPOSE_OK──▶ decomposed
     decomposing ──DECOMPOSE_FAIL──▶ analyzed (error set)
     decomposed ──PROPOSAL_BUILT──▶ proposal
     proposal ──DECISION(revise/alt)──▶ proposal   (versions grow; computed by caller)
     proposal ──APPROVE──▶ approved
     proposal ──CANCEL──▶ input
     approved ──OPEN_BRANCH_PREP──▶ branch-prep
     branch-prep ──BRANCH_PREP_OK──▶ final-approve
     final-approve ──BEGIN_IMPLEMENT──▶ implementing
     implementing ──IMPLEMENT_OK──▶ review
     review ──OPEN_APPLY_CONFIRM──▶ apply-confirm  (freezes accepted edits)
     apply-confirm ──BEGIN_APPLY──▶ applying
     applying ──APPLY_SUCCEEDED──▶ qa
     applying ──APPLY_FAILED──▶ apply-confirm      (conflict/partial; no QA)
     review|apply-confirm ──SKIP_APPLY──▶ qa       (verify without writing)
     qa ──QA_REPORT──▶ complete
     any ──RESET──▶ initial
     any ──DETACH──▶ input (project + downstream cleared)

   Back edges (each guarded to its own stage):
     reviewed ──BACK_TO_BRANCH_PREP──▶ branch-prep   (from final-approve)
     reviewed ──BACK_TO_REVIEW──▶ review             (from qa)
     review ──BACK_TO_REVIEW_FROM_APPLY──▶ review    (unfreezes the apply set)
     * the proposal's own BACK_* edges handle steps 1–5.

   Write invariant: proposal approval and per-file review are provisional.
   Disk writes happen only through two explicit confirm actions — the
   opt-in branch creation and the apply-confirm gate. The reducer itself is
   pure; the hook performs I/O behind those actions.

   `viewingVersion` overlays any proposal-bearing stage: non-null
   means the rail is pinned to a past version (read-only).
   ============================================================ */

import type { ApplyResult, DirListing, FileEdit, GitStatus, VerifyReport } from '../host/types';
import type { ProjectAnalysis } from '../project/analyze';
import type { Workstream } from '../project/decompose';
import type { DesignProposal } from '../project/proposal';
import type { FileDiff } from '../project/diff';

export type Stage =
  | 'input'
  | 'analyzing'
  | 'analyzed'
  | 'decomposing'
  | 'decomposed'
  | 'proposal'
  | 'approved'
  | 'branch-prep'
  | 'final-approve'
  | 'implementing'
  | 'review'
  | 'apply-confirm'
  | 'applying'
  | 'qa'
  | 'complete';

/** The user's branch decision, recorded on the branch-prep stage. */
export interface BranchChoice {
  /** 'create' = make a branch, 'skip' = proceed on the current one. */
  mode: 'create' | 'skip';
  /** The branch the user is on now (from git status), for display. */
  currentBranch?: string;
  /** The new branch name, when mode==='create'. */
  name?: string;
  /** The branch that resulted (created) — equals `name` after a successful create. */
  created?: string;
  /** Whether the tree was dirty and the user acknowledged it. */
  dirtyAcknowledged?: boolean;
}

/** The generated dry-run plan the review stage renders. */
export interface ImplementationPlanState {
  diffs: FileDiff[];
  /** Complete preimage/replacement payloads for changed files. */
  edits: FileEdit[];
  skipped: { path: string; reason: string }[];
  totals: { files: number; adds: number; dels: number };
  generatedAt: number;
}

export interface AttachedProject {
  /** Mock sample id (serves as the "root"); a real host would pass a path. */
  id: string;
  label: string;
  git: GitStatus;
}

export interface WsState {
  stage: Stage;
  brief: string;
  attached?: AttachedProject;
  listing?: DirListing;
  analysis?: ProjectAnalysis;
  workstreams?: Workstream[];
  /** Full history, v1 first. The latest proposal is the last entry. */
  versions: DesignProposal[];
  /** Non-null only while the rail is pinned to a past version. */
  viewingVersion: number | null;
  /** Stage 6 — the branch decision (opt-in; default mode is 'skip'). */
  branch?: BranchChoice;
  /** Stage 7 — set once the user passes the final approval gate. */
  finalApprovedAt?: number;
  /** Stage 8 — the generated dry-run plan. */
  plan?: ImplementationPlanState;
  /** Per-file review decisions, keyed by path (UI-only, no writes). */
  reviewDecisions: Record<string, 'accept' | 'skip'>;
  /** Frozen accepted edits while awaiting/after an explicit apply. */
  pendingEdits?: FileEdit[];
  /** The host's outcome for the last apply, if one ran. */
  applyResult?: ApplyResult;
  /** Stage 9 — the QA report from the host. */
  qa?: VerifyReport;
  /**
   * Set when a stage fell back to its deterministic path because the model
   * was unavailable or returned something unusable. Non-fatal: the stage
   * still produced output, but the user deserves to know which path ran.
   */
  modelNote?: string;
  error?: string;
}

export const initialState: WsState = {
  stage: 'input',
  brief: '',
  versions: [],
  viewingVersion: null,
  reviewDecisions: {},
};

/* ---------------------------------------------------------- */
/* Actions                                                     */
/* ---------------------------------------------------------- */

export type WsAction =
  | { type: 'SET_BRIEF'; brief: string }
  | { type: 'ATTACH'; project: AttachedProject }
  | { type: 'ATTACH_FAIL'; error: string }
  | { type: 'DETACH' }
  | { type: 'BEGIN_ANALYSIS' }
  | { type: 'ANALYSIS_OK'; listing: DirListing; analysis: ProjectAnalysis }
  | { type: 'ANALYSIS_FAIL'; error: string }
  | { type: 'BEGIN_DECOMPOSE' }
  | { type: 'DECOMPOSE_OK'; workstreams: Workstream[]; note?: string }
  | { type: 'DECOMPOSE_FAIL'; error: string }
  | { type: 'PROPOSAL_BUILT'; proposal: DesignProposal; note?: string }
  | { type: 'PROPOSAL_FAIL'; error: string }
  | { type: 'PROPOSAL_APPEND'; proposal: DesignProposal }
  | { type: 'APPROVE' }
  | { type: 'CANCEL' }
  | { type: 'VIEW_VERSION'; version: number }
  | { type: 'BACK_TO_INPUT' }
  | { type: 'BACK_TO_ANALYZED' }
  /* --- stages 6–9 ------------------------------------------------ */
  | { type: 'REFRESH_GIT'; git: GitStatus }
  | { type: 'OPEN_BRANCH_PREP' }
  | { type: 'SET_BRANCH_CHOICE'; choice: BranchChoice }
  | { type: 'BRANCH_PREP_OK'; choice: BranchChoice }
  | { type: 'BRANCH_FAIL'; error: string }
  | { type: 'BACK_TO_PROPOSAL' }
  | { type: 'BACK_TO_BRANCH_PREP' }
  | { type: 'BEGIN_IMPLEMENT'; finalApprovedAt: number }
  | { type: 'IMPLEMENT_OK'; plan: ImplementationPlanState; note?: string }
  | { type: 'IMPLEMENT_FAIL'; error: string }
  | { type: 'SET_REVIEW_DECISION'; path: string; decision: 'accept' | 'skip' }
  | { type: 'SET_REVIEW_DECISIONS'; decisions: Record<string, 'accept' | 'skip'> }
  | { type: 'OPEN_APPLY_CONFIRM' }
  | { type: 'BACK_TO_REVIEW_FROM_APPLY' }
  | { type: 'BEGIN_APPLY' }
  | { type: 'APPLY_FAILED'; result: ApplyResult; error?: string }
  | { type: 'APPLY_SUCCEEDED'; result: ApplyResult }
  | { type: 'SKIP_APPLY' }
  | { type: 'QA_REPORT'; report: VerifyReport }
  | { type: 'QA_FAIL'; error: string }
  | { type: 'BACK_TO_REVIEW' }
  | { type: 'RESET' };

/** How the machine answers a transition from a stage that doesn't
    allow it. We ignore illegal events rather than throw — a UI can
    double-fire (e.g. a click during a re-render), and the machine
    should be idempotent, not crash. The `stage` guard makes each
    case explicit, which is the whole point of the reducer. */
export function workspaceReducer(state: WsState, action: WsAction): WsState {
  switch (action.type) {
    case 'SET_BRIEF':
      return { ...state, brief: action.brief };

    case 'ATTACH':
      // A fresh project resets everything downstream of attachment.
      return {
        ...initialState,
        brief: state.brief,
        stage: 'input',
        attached: action.project,
      };

    case 'DETACH':
      return { ...initialState, brief: state.brief };

    case 'ATTACH_FAIL':
      // A folder couldn't be attached (allowlist refusal, missing path…).
      // Stay on the input stage and show the error; clear on next attempt.
      if (state.stage !== 'input') return state;
      return { ...state, error: action.error };

    case 'BEGIN_ANALYSIS':
      if (state.stage !== 'input' || !state.attached) return state;
      return { ...state, stage: 'analyzing', error: undefined };

    case 'ANALYSIS_OK':
      if (state.stage !== 'analyzing') return state;
      return {
        ...state,
        stage: 'analyzed',
        listing: action.listing,
        analysis: action.analysis,
        error: undefined,
      };

    case 'ANALYSIS_FAIL':
      if (state.stage !== 'analyzing') return state;
      return { ...state, stage: 'input', error: action.error };

    case 'BEGIN_DECOMPOSE':
      if (state.stage !== 'analyzed') return state;
      return { ...state, stage: 'decomposing', error: undefined, modelNote: undefined };

    case 'DECOMPOSE_OK':
      if (state.stage !== 'decomposing') return state;
      return {
        ...state,
        stage: 'decomposed',
        workstreams: action.workstreams,
        modelNote: action.note,
        error: undefined,
      };

    case 'DECOMPOSE_FAIL':
      if (state.stage !== 'decomposing') return state;
      return { ...state, stage: 'analyzed', error: action.error };

    case 'PROPOSAL_BUILT':
      if (state.stage !== 'decomposed') return state;
      return {
        ...state,
        stage: 'proposal',
        versions: [action.proposal],
        viewingVersion: null,
        modelNote: action.note,
        error: undefined,
      };

    case 'PROPOSAL_FAIL':
      // The proposal builder itself threw (a code bug, not a model failure
      // — model failures are absorbed by `withFallback`). Stay on the
      // decomposed stage so the user can retry the next step.
      if (state.stage !== 'decomposed') return state;
      return { ...state, error: action.error };

    case 'PROPOSAL_APPEND':
      // revise / alternative — the caller has already computed the new
      // proposal (it needs Date.now()); we just record it immutably.
      if (state.stage !== 'proposal') return state;
      return {
        ...state,
        versions: [...state.versions, action.proposal],
        viewingVersion: null,
      };

    case 'APPROVE':
      if (state.stage !== 'proposal') return state;
      return { ...state, stage: 'approved' };

    /* --- stage 6: branch prep ---------------------------------- */
    case 'REFRESH_GIT':
      // Re-read the working tree's git status (branch, dirty) without
      // moving stages — used when the branch-prep stage opens so the
      // dirty warning + current branch are live, not stale from attach.
      if (!state.attached) return state;
      return {
        ...state,
        attached: { ...state.attached, git: action.git },
        branch: state.branch
          ? { ...state.branch, currentBranch: action.git.branch ?? state.branch.currentBranch }
          : state.branch,
      };

    case 'OPEN_BRANCH_PREP':
      if (state.stage !== 'approved') return state;
      // Default: no branch (opt-in). Seed the choice from the attached
      // project's current branch so the stage opens with real context.
      return {
        ...state,
        stage: 'branch-prep',
        branch:
          state.branch ?? {
            mode: 'skip',
            currentBranch: state.attached?.git.branch,
          },
      };

    case 'SET_BRANCH_CHOICE':
      if (state.stage !== 'branch-prep') return state;
      // Editing the choice while still on the stage; no stage change.
      return { ...state, branch: action.choice };

    case 'BRANCH_PREP_OK':
      if (state.stage !== 'branch-prep') return state;
      return { ...state, stage: 'final-approve', branch: action.choice, error: undefined };

    case 'BRANCH_FAIL':
      // A create-branch attempt was refused (dirty tree, name exists…).
      // Stay on the stage; surface the note so the user can react.
      if (state.stage !== 'branch-prep') return state;
      return { ...state, error: action.error };

    case 'BACK_TO_PROPOSAL':
      // From the branch-prep / approval gate back to the proposal. Clears
      // the branch decision + downstream so re-approval starts fresh.
      if (state.stage !== 'branch-prep' && state.stage !== 'final-approve') {
        return state;
      }
      return {
        ...state,
        stage: 'proposal',
        branch: undefined,
        finalApprovedAt: undefined,
        plan: undefined,
        qa: undefined,
        reviewDecisions: {},
        pendingEdits: undefined,
        applyResult: undefined,
      };

    /* --- stage 7: final approval → implement ------------------- */
    case 'BEGIN_IMPLEMENT':
      if (state.stage !== 'final-approve') return state;
      return {
        ...state,
        stage: 'implementing',
        finalApprovedAt: action.finalApprovedAt,
        plan: undefined,
        error: undefined,
        modelNote: undefined,
      };

    /* --- stage 8: implementation (dry-run) --------------------- */
    case 'IMPLEMENT_OK':
      if (state.stage !== 'implementing') return state;
      // Default every diffed file to "accept" for review; the user flips
      // individual files off. Pure UI state — nothing is written.
      return {
        ...state,
        stage: 'review',
        plan: action.plan,
        modelNote: action.note,
        reviewDecisions: Object.fromEntries(
          action.plan.diffs
            .filter((d) => d.status !== 'unchanged')
            .map((d) => [d.path, 'accept' as const]),
        ),
        error: undefined,
      };

    case 'IMPLEMENT_FAIL':
      if (state.stage !== 'implementing') return state;
      return { ...state, stage: 'final-approve', error: action.error };

    case 'SET_REVIEW_DECISION':
      if (state.stage !== 'review') return state;
      return {
        ...state,
        reviewDecisions: { ...state.reviewDecisions, [action.path]: action.decision },
      };

    case 'SET_REVIEW_DECISIONS':
      if (state.stage !== 'review') return state;
      return { ...state, reviewDecisions: { ...action.decisions } };

    case 'OPEN_APPLY_CONFIRM': {
      // Freeze the accepted set here. Later review edits cannot silently
      // change what the user is about to authorize writing.
      if (state.stage !== 'review' || !state.plan) return state;
      const accepted = new Set(acceptedDiffs(state).map((d) => d.path));
      const pendingEdits = state.plan.edits.filter((e) => accepted.has(e.path));
      return { ...state, stage: 'apply-confirm', pendingEdits, applyResult: undefined };
    }

    case 'BACK_TO_REVIEW_FROM_APPLY':
      if (state.stage !== 'apply-confirm') return state;
      // Un-freeze: the user must review again before a later confirmation.
      return { ...state, stage: 'review', pendingEdits: undefined, applyResult: undefined };

    case 'BEGIN_APPLY':
      if (state.stage !== 'apply-confirm') return state;
      if (!state.pendingEdits?.length) return state;
      return { ...state, stage: 'applying', applyResult: undefined, error: undefined };

    case 'APPLY_SUCCEEDED':
      // Only a real or simulated success proceeds to QA. The copy in QA must
      // distinguish a simulated write from changes actually on disk.
      if (state.stage !== 'applying') return state;
      if (action.result.status !== 'applied' && action.result.status !== 'simulated') {
        return state;
      }
      return {
        ...state,
        stage: 'qa',
        applyResult: action.result,
        qa: undefined,
        error: undefined,
      };

    case 'APPLY_FAILED':
      // Conflict, failure, or partial application: stay at the confirmation
      // gate with the frozen paths and the host's exact outcome. Never run QA
      // as if the whole batch landed.
      if (state.stage !== 'applying') return state;
      return {
        ...state,
        stage: 'apply-confirm',
        applyResult: action.result,
        error: action.error,
      };

    case 'SKIP_APPLY':
      // Verify without writing — the only route to QA when nothing is
      // accepted, and an explicit escape hatch at the confirmation gate.
      if (state.stage !== 'review' && state.stage !== 'apply-confirm') return state;
      return {
        ...state,
        stage: 'qa',
        pendingEdits: undefined,
        applyResult: undefined,
        qa: undefined,
        error: undefined,
      };

    case 'BACK_TO_REVIEW':
      if (state.stage !== 'qa') return state;
      // The proposal is stale after an apply; require a fresh review before
      // any further write. Clear the old result so it can't be mistaken for
      // an outcome of the next attempt.
      return {
        ...state,
        stage: 'review',
        qa: undefined,
        pendingEdits: undefined,
        applyResult: undefined,
      };

    /* --- stage 9: QA ------------------------------------------- */
    case 'QA_REPORT':
      if (state.stage !== 'qa') return state;
      return { ...state, stage: 'complete', qa: action.report, error: undefined };

    case 'QA_FAIL':
      if (state.stage !== 'qa') return state;
      return { ...state, stage: 'review', error: action.error };

    case 'BACK_TO_BRANCH_PREP':
      if (state.stage !== 'final-approve') return state;
      return { ...state, stage: 'branch-prep' };

    case 'BACK_TO_INPUT':
      // Return to the brief/attach stage but KEEP the attached project and
      // its analysis, so the user can edit the brief and re-run without
      // re-attaching. Clears only the decomposition/proposal downstream
      // (and any stages 6–9 state that depended on them).
      return {
        ...state,
        stage: 'input',
        workstreams: undefined,
        versions: [],
        viewingVersion: null,
        branch: undefined,
        finalApprovedAt: undefined,
        plan: undefined,
        qa: undefined,
        reviewDecisions: {},
        pendingEdits: undefined,
        applyResult: undefined,
        error: undefined,
        modelNote: undefined,
      };

    case 'BACK_TO_ANALYZED':
      // Step back from the decomposition review to the analysis report
      // without re-running analysis. Clears the decomposed workstreams.
      if (state.stage !== 'decomposed') return state;
      return {
        ...state,
        stage: 'analyzed',
        workstreams: undefined,
        modelNote: undefined,
      };

    case 'CANCEL':
    case 'RESET':
      return { ...initialState };

    case 'VIEW_VERSION': {
      if (state.stage !== 'proposal') return state;
      const latest = latestVersion(state);
      // Clicking the latest version un-pins; any other pins it.
      return {
        ...state,
        viewingVersion: action.version === latest ? null : action.version,
      };
    }

    default:
      return state;
  }
}

/* ---------------------------------------------------------- */
/* Selectors — derived, never stored                          */
/* ---------------------------------------------------------- */

export function latestVersion(state: WsState): number {
  return state.versions[state.versions.length - 1]?.version ?? 1;
}

/** The proposal the UI should show: pinned past version, else latest. */
export function displayedProposal(state: WsState): DesignProposal | undefined {
  if (state.viewingVersion != null) {
    return state.versions.find((v) => v.version === state.viewingVersion);
  }
  return state.versions[state.versions.length - 1];
}

/** In-flight is fully determined by the transient stages (analysis,
    decomposition, and the two async stage-7/8/9 steps). */
export function isBusy(state: WsState): boolean {
  return (
    state.stage === 'analyzing' ||
    state.stage === 'decomposing' ||
    state.stage === 'implementing' ||
    state.stage === 'applying' ||
    state.stage === 'qa'
  );
}

/* --- stage 6–9 selectors ------------------------------------- */

/** The proposal the user actually approved (the latest, not a pinned past one). */
export function approvedProposal(state: WsState): DesignProposal | undefined {
  return state.versions[state.versions.length - 1];
}

/**
 * Can the branch-prep stage advance? True when the user chose "skip"
 * (proceed on current branch), or chose "create" with a valid name —
 * and, if the tree is dirty, has acknowledged it. The name-format check
 * is duplicated here (mirrors server BRANCH_RE) so the button state is
 * derived, not hand-tracked.
 */
export const BRANCH_NAME_RE = /^[a-z0-9][a-z0-9._/-]*$/i;
export function isValidBranchName(name: string | undefined): boolean {
  if (!name) return false;
  if (!BRANCH_NAME_RE.test(name)) return false;
  if (name.includes('..') || name.includes('//')) return false;
  if (name.endsWith('/') || name.endsWith('.')) return false;
  return true;
}

export function canAdvanceBranchPrep(state: WsState): boolean {
  const b = state.branch;
  if (!b) return false;
  if (b.mode === 'skip') {
    // If the tree is dirty, skipping still requires acknowledgement so the
    // user knowingly proceeds on a dirty working copy (never auto-stashed).
    return !state.attached?.git.dirty || Boolean(b.dirtyAcknowledged);
  }
  // mode === 'create'
  if (!isValidBranchName(b.name)) return false;
  return !state.attached?.git.dirty || Boolean(b.dirtyAcknowledged);
}

/** Files the user has accepted for the (dry-run) implementation. */
export function acceptedDiffs(state: WsState): FileDiff[] {
  if (!state.plan) return [];
  return state.plan.diffs.filter(
    (d) => d.status !== 'unchanged' && state.reviewDecisions[d.path] === 'accept',
  );
}

/** True once the host reported the frozen batch fully (or partly) written. */
export function hasDiskWrites(result: ApplyResult | undefined): boolean {
  return Boolean(result && result.status !== 'simulated' && result.applied.length);
}

/**
 * Slug a brief into a `feat/…` branch name — the branch-prep default.
 * Lower-cases, drops punctuation, collapses to hyphen-separated words,
 * and caps length so the result always passes isValidBranchName.
 */
export function slugToBranch(brief: string, maxWords = 5): string {
  const words = brief
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords);
  const slug = words.join('-').slice(0, 48).replace(/-+$/, '');
  return slug ? `feat/${slug}` : 'feat/change';
}

/** Aggregate verdict for the QA report — the worst step status wins. */
export type QaVerdict = 'pass' | 'fail' | 'unavailable';
export function qaVerdict(state: WsState): QaVerdict {
  const report = state.qa;
  if (!report) return 'unavailable';
  const steps = Object.values(report.steps);
  if (steps.some((s) => s.status === 'fail' || s.status === 'error')) return 'fail';
  if (steps.every((s) => s.status === 'skipped' || s.status === 'unavailable')) {
    return 'unavailable';
  }
  return 'pass';
}
