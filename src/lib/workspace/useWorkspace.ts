/* ============================================================
   useWorkspace — thin glue over the pure workspace machine.

   All state lives in `workspaceReducer` (./machine.ts). This hook
   only does the impure part: async orchestration through the
   HostBridge seam, the stale-result guard, and computing time-
   dependent values (revise/alternative need Date.now(); the dry-run
   plan needs real file reads; QA needs the host) — so they are built
   here and dispatched as finished objects, keeping the reducer pure.

   Mutation discipline (the whole point of the milestone):
     · the ONLY disk-mutating call is `createBranch`, fired from
       `confirmBranch` — an explicit user action on the branch-prep
       stage. Everything else is read-only. Nothing writes before the
       final approval gate, and even then only the opt-in branch.
   ============================================================ */

import { useCallback, useReducer, useRef } from 'react';
import { host } from '../host';
import type { DirListing, VerifyReport } from '../host/types';
import { analyze, type ProjectAnalysis } from '../project/analyze';
import { decompose, type Workstream } from '../project/decompose';
import {
  buildProposal,
  chooseAlternative,
  revise,
  type Alternative,
  type Decision,
  type DesignProposal,
} from '../project/proposal';
import { generateImplementation } from '../project/implement';
import {
  acceptedDiffs,
  canAdvanceBranchPrep,
  displayedProposal,
  initialState,
  isBusy,
  latestVersion,
  qaVerdict,
  workspaceReducer,
  type AttachedProject,
  type BranchChoice,
  type ImplementationPlanState,
  type QaVerdict,
  type Stage,
} from './machine';
import type { FileDiff } from '../project/diff';

// Re-export the public types + pure helpers so views import from one place.
export type {
  Stage,
  AttachedProject,
  BranchChoice,
  QaVerdict,
  ImplementationPlanState,
} from './machine';
export { slugToBranch, isValidBranchName } from './machine';

export interface WorkspaceState {
  stage: Stage;
  brief: string;
  attached?: AttachedProject;
  listing?: DirListing;
  analysis?: ProjectAnalysis;
  workstreams?: Workstream[];
  proposal?: DesignProposal;
  /** Full history, v1 first. The current proposal is the last entry. */
  versions: DesignProposal[];
  /** Version number of the latest proposal. */
  currentVersion: number;
  /** Non-null only while the rail is pinned to a past version. */
  viewingVersion: number | null;
  /** Stage 6 — the branch decision (mutable while on branch-prep). */
  branch?: BranchChoice;
  /** Stage 7 — epoch ms of final approval, else undefined. */
  finalApprovedAt?: number;
  /** Stage 8 — the generated dry-run plan. */
  plan?: ImplementationPlanState;
  /** Per-file review decisions (UI state only — nothing written). */
  reviewDecisions: Record<string, 'accept' | 'skip'>;
  /** Files the user has accepted for the (dry-run) implementation. */
  acceptedFiles: FileDiff[];
  /** Stage 9 — the host's QA report. */
  qa?: VerifyReport;
  /** Derived overall QA verdict. */
  qaVerdict: QaVerdict;
  error?: string;

  setBrief: (b: string) => void;
  attach: (id: string, label: string) => Promise<void>;
  detach: () => void;
  runAnalysis: () => Promise<void>;
  runDecompose: () => Promise<void>;
  runProposal: () => void;
  decide: (d: Decision) => void;
  viewVersion: (version: number) => void;
  backToInput: () => void;
  backToAnalyzed: () => void;

  /* stages 6–9 */
  /** Leave approval, refreshing git status, and open branch-prep. */
  openBranchPrep: () => Promise<void>;
  /** Record the in-progress branch choice (mode/name/acknowledgement). */
  setBranchChoice: (choice: BranchChoice) => void;
  /** Can the branch-prep stage advance right now (derived)? */
  canAdvanceBranchPrep: boolean;
  /** Create the opted-in branch (the one mutating call), then advance. */
  confirmBranch: (choice: BranchChoice) => Promise<void>;
  /** Skip branch creation and advance to the final-approval gate. */
  skipBranch: (choice: BranchChoice) => void;
  /** Step back from the gate to the proposal. */
  backToProposal: () => void;
  /** Step back from the gate to branch-prep. */
  backToBranchPrep: () => void;
  /** Pass the final gate and generate the dry-run implementation. */
  beginImplement: () => Promise<void>;
  /** Flip one file's review decision (accept/skip). */
  setReviewDecision: (path: string, decision: 'accept' | 'skip') => void;
  /** Accept or skip every changed file at once. */
  setAllReviewDecisions: (decision: 'accept' | 'skip') => void;
  /** Pass review and run QA through the host. */
  approveFinal: () => Promise<void>;
  /** Return from QA to the review stage. */
  backToReview: () => void;
  reset: () => void;
  /** True while any async step is in flight. Derived from stage. */
  busy: boolean;
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useWorkspace(): WorkspaceState {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);

  // Guards against overlapping async runs / late results after reset.
  const runId = useRef(0);

  // Read the latest state from a ref the reducer result updates each render.
  const stateRef = useRef(state);
  stateRef.current = state;

  const setBrief = useCallback((brief: string) => {
    dispatch({ type: 'SET_BRIEF', brief });
  }, []);

  const attach = useCallback(async (id: string, label: string) => {
    const git = await host.gitStatus(id);
    dispatch({ type: 'ATTACH', project: { id, label, git } });
  }, []);

  const detach = useCallback(() => {
    runId.current++;
    dispatch({ type: 'DETACH' });
  }, []);

  const runAnalysis = useCallback(async () => {
    const attached = stateRef.current.attached;
    if (!attached) {
      dispatch({ type: 'ANALYSIS_FAIL', error: 'Attach a project directory first.' });
      return;
    }
    const my = ++runId.current;
    dispatch({ type: 'BEGIN_ANALYSIS' });
    try {
      const list = await host.listProject(attached.id);
      if (my !== runId.current) return;
      await tick(360);
      if (my !== runId.current) return;
      const result = analyze(list);
      dispatch({ type: 'ANALYSIS_OK', listing: list, analysis: result });
    } catch (e) {
      if (my !== runId.current) return;
      dispatch({
        type: 'ANALYSIS_FAIL',
        error: e instanceof Error ? e.message : 'Analysis failed.',
      });
    }
  }, []);

  const runDecompose = useCallback(async () => {
    const { attached, analysis, listing, brief } = stateRef.current;
    if (!attached || !analysis || !listing) {
      dispatch({ type: 'DECOMPOSE_FAIL', error: 'Run the project analysis first.' });
      return;
    }
    const my = ++runId.current;
    dispatch({ type: 'BEGIN_DECOMPOSE' });
    try {
      await tick(680);
      if (my !== runId.current) return;
      const workstreams = decompose(brief, analysis, listing);
      dispatch({ type: 'DECOMPOSE_OK', workstreams });
    } catch (e) {
      if (my !== runId.current) return;
      dispatch({
        type: 'DECOMPOSE_FAIL',
        error: e instanceof Error ? e.message : 'Decomposition failed.',
      });
    }
  }, []);

  const runProposal = useCallback(() => {
    const { analysis, workstreams, brief } = stateRef.current;
    if (!analysis || !workstreams) return;
    const proposal = buildProposal(brief, analysis, workstreams);
    dispatch({ type: 'PROPOSAL_BUILT', proposal });
  }, []);

  const decide = useCallback((d: Decision) => {
    if (d.kind === 'cancel') {
      runId.current++;
      dispatch({ type: 'CANCEL' });
      return;
    }
    if (d.kind === 'approve') {
      dispatch({ type: 'APPROVE' });
      return;
    }
    const s = stateRef.current;
    const current = s.versions[s.versions.length - 1];
    if (!current) return;
    let next: DesignProposal;
    if (d.kind === 'revise') {
      next = revise(current, d.instruction);
    } else {
      const alt: Alternative | undefined = current.alternatives?.find((a) => a.id === d.id);
      if (!alt) return;
      next = chooseAlternative(current, alt);
    }
    dispatch({ type: 'PROPOSAL_APPEND', proposal: next });
  }, []);

  const viewVersion = useCallback((version: number) => {
    dispatch({ type: 'VIEW_VERSION', version });
  }, []);

  const backToInput = useCallback(() => {
    dispatch({ type: 'BACK_TO_INPUT' });
  }, []);

  const backToAnalyzed = useCallback(() => {
    dispatch({ type: 'BACK_TO_ANALYZED' });
  }, []);

  /* ---------------------------------------------------------- */
  /* stage 6 — branch prep                                       */
  /* ---------------------------------------------------------- */

  const openBranchPrep = useCallback(async () => {
    const attached = stateRef.current.attached;
    if (!attached) return;
    // Refresh git status first so the dirty warning + current branch are
    // live. Read-only; then open the stage.
    try {
      const git = await host.gitStatus(attached.id);
      dispatch({ type: 'REFRESH_GIT', git });
    } catch {
      /* keep the status from attach if the host can't re-read */
    }
    dispatch({ type: 'OPEN_BRANCH_PREP' });
  }, []);

  const setBranchChoice = useCallback((choice: BranchChoice) => {
    dispatch({ type: 'SET_BRANCH_CHOICE', choice });
  }, []);

  const confirmBranch = useCallback(async (choice: BranchChoice) => {
    const s = stateRef.current;
    const attached = s.attached;
    if (!attached || choice.mode !== 'create' || !choice.name) return;

    const my = ++runId.current;
    try {
      // The ONLY mutating host call, and it's behind this explicit action.
      const res = await host.createBranch(attached.id, choice.name);
      if (my !== runId.current) return;
      if (!res.ok) {
        // Refused (dirty tree without opt-in, name exists…). Stay on the
        // stage and show the note; nothing advanced, nothing was stashed.
        dispatch({ type: 'BRANCH_FAIL', error: res.note ?? 'Could not create the branch.' });
        return;
      }
      // Refresh git so the displayed branch reflects the creation.
      let git = attached.git;
      try {
        git = await host.gitStatus(attached.id);
        if (my !== runId.current) return;
        dispatch({ type: 'REFRESH_GIT', git });
      } catch {
        /* fall back to the optimistic branch name below */
      }
      dispatch({
        type: 'BRANCH_PREP_OK',
        choice: { ...choice, created: res.branch ?? choice.name, currentBranch: git.branch },
      });
    } catch (e) {
      if (my !== runId.current) return;
      dispatch({
        type: 'BRANCH_FAIL',
        error: e instanceof Error ? e.message : 'Branch creation failed.',
      });
    }
  }, []);

  const skipBranch = useCallback((choice: BranchChoice) => {
    dispatch({ type: 'BRANCH_PREP_OK', choice: { ...choice, mode: 'skip' } });
  }, []);

  const backToProposal = useCallback(() => {
    dispatch({ type: 'BACK_TO_PROPOSAL' });
  }, []);

  const backToBranchPrep = useCallback(() => {
    dispatch({ type: 'BACK_TO_BRANCH_PREP' });
  }, []);

  /* ---------------------------------------------------------- */
  /* stage 7–8 — final gate + dry-run implementation             */
  /* ---------------------------------------------------------- */

  const beginImplement = useCallback(async () => {
    const s = stateRef.current;
    const { attached, brief, workstreams, analysis, listing } = s;
    if (!attached) return;

    const my = ++runId.current;
    const finalApprovedAt = Date.now();
    dispatch({ type: 'BEGIN_IMPLEMENT', finalApprovedAt });
    try {
      // Small beat so "implementing" reads as work, not a flash.
      await tick(400);
      if (my !== runId.current) return;
      // Deterministic re-derive of the plan inputs if a back-nav dropped
      // them (defensive): workstreams come from the proposal otherwise.
      const streams: Workstream[] =
        workstreams ??
        s.versions[s.versions.length - 1]?.workstreams ??
        (analysis && listing ? decompose(brief, analysis, listing) : []);
      const implPlan = await generateImplementation(host, attached.id, brief, streams);
      if (my !== runId.current) return;
      dispatch({
        type: 'IMPLEMENT_OK',
        plan: {
          diffs: implPlan.diffs,
          skipped: implPlan.skipped,
          totals: implPlan.totals,
          generatedAt: implPlan.generatedAt,
        },
      });
    } catch (e) {
      if (my !== runId.current) return;
      dispatch({
        type: 'IMPLEMENT_FAIL',
        error: e instanceof Error ? e.message : 'Could not generate the implementation plan.',
      });
    }
  }, []);

  const setReviewDecision = useCallback((path: string, decision: 'accept' | 'skip') => {
    dispatch({ type: 'SET_REVIEW_DECISION', path, decision });
  }, []);

  const setAllReviewDecisions = useCallback((decision: 'accept' | 'skip') => {
    const plan = stateRef.current.plan;
    if (!plan) return;
    const decisions: Record<string, 'accept' | 'skip'> = {};
    for (const d of plan.diffs) {
      if (d.status !== 'unchanged') decisions[d.path] = decision;
    }
    dispatch({ type: 'SET_REVIEW_DECISIONS', decisions });
  }, []);

  const approveFinal = useCallback(async () => {
    const s = stateRef.current;
    const attached = s.attached;
    if (!attached || !s.plan) return;

    const my = ++runId.current;
    dispatch({ type: 'APPROVE_FINAL' });
    try {
      const report = await host.verify(attached.id);
      if (my !== runId.current) return;
      dispatch({ type: 'QA_REPORT', report });
    } catch (e) {
      if (my !== runId.current) return;
      dispatch({
        type: 'QA_FAIL',
        error: e instanceof Error ? e.message : 'Verification failed to run.',
      });
    }
  }, []);

  const backToReview = useCallback(() => {
    dispatch({ type: 'BACK_TO_REVIEW' });
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    stage: state.stage,
    brief: state.brief,
    attached: state.attached,
    listing: state.listing,
    analysis: state.analysis,
    workstreams: state.workstreams,
    proposal: displayedProposal(state),
    versions: state.versions,
    currentVersion: latestVersion(state),
    viewingVersion: state.viewingVersion,
    branch: state.branch,
    finalApprovedAt: state.finalApprovedAt,
    plan: state.plan,
    reviewDecisions: state.reviewDecisions,
    acceptedFiles: acceptedDiffs(state),
    qa: state.qa,
    qaVerdict: qaVerdict(state),
    error: state.error,
    setBrief,
    attach,
    detach,
    runAnalysis,
    runDecompose,
    runProposal,
    decide,
    viewVersion,
    backToInput,
    backToAnalyzed,
    openBranchPrep,
    setBranchChoice,
    canAdvanceBranchPrep: canAdvanceBranchPrep(state),
    confirmBranch,
    skipBranch,
    backToProposal,
    backToBranchPrep,
    beginImplement,
    setReviewDecision,
    setAllReviewDecisions,
    approveFinal,
    backToReview,
    reset,
    busy: isBusy(state),
  };
}
