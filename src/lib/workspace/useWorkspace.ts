/* ============================================================
   useWorkspace — thin glue over the pure workspace machine.

   All state lives in `workspaceReducer` (./machine.ts). This hook
   only does the impure part: async orchestration through the
   HostBridge seam, the stale-result guard, and computing time-
   dependent values (revise/alternative need Date.now(); the dry-run
   plan needs real file reads; QA needs the host) — so they are built
   here and dispatched as finished objects, keeping the reducer pure.

   Mutation discipline (the whole point of the milestone):
     · exactly two disk-mutating calls exist, each behind its own
       explicit user action:
         - `createBranch`, fired from `confirmBranch` (opt-in branch at
           the branch-prep stage)
         - `applyEdits`, fired from `confirmApply` (the accepted files,
           written only at the apply-confirmation gate)
     · everything else is read-only. Generating the plan, accepting
       files and leaving review are all provisional; nothing is written
       until the user confirms the frozen batch.
   ============================================================ */

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { host } from '../host';
import type { ApplyResult, DirListing, FileEdit, VerifyReport, RootCandidate } from '../host/types';
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
  hasDiskWrites,
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
  /** Which host is live — 'mock' offers samples, 'local' offers real roots. */
  hostKind: 'mock' | 'local';
  /** Folders the user can attach (samples in mock, allowlisted roots in local). */
  roots: RootCandidate[];
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
  /** Files the user has accepted for the (not-yet-written) implementation. */
  acceptedFiles: FileDiff[];
  /** The frozen batch awaiting (or holding) an explicit apply decision. */
  pendingEdits?: FileEdit[];
  /** The host's outcome for the last apply, if one ran. */
  applyResult?: ApplyResult;
  /** True when the host reported files really landed on disk. */
  hasDiskWrites: boolean;
  /** Stage 9 — the host's QA report. */
  qa?: VerifyReport;
  /** Derived overall QA verdict. */
  qaVerdict: QaVerdict;
  error?: string;

  setBrief: (b: string) => void;
  attach: (id: string, label: string) => Promise<void>;
  /** Re-fetch the attachable roots (e.g. after starting the sidecar). */
  reloadRoots: () => Promise<void>;
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
  /** Pass the final gate and generate the implementation proposal. */
  beginImplement: () => Promise<void>;
  /** Flip one file's review decision (accept/skip). */
  setReviewDecision: (path: string, decision: 'accept' | 'skip') => void;
  /** Accept or skip every changed file at once. */
  setAllReviewDecisions: (decision: 'accept' | 'skip') => void;
  /** Freeze the accepted set and open the apply-confirmation gate. */
  openApplyConfirm: () => void;
  /** THE write: apply the frozen batch, then run QA on the updated root. */
  confirmApply: () => Promise<void>;
  /** Verify without writing anything (skip the apply). */
  skipApply: () => Promise<void>;
  /** Un-freeze the batch and return to review. */
  backFromApply: () => void;
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

  // Host metadata: which folders can be attached. Loads once on mount (and
  // if the host is swapped by resolveHost, roots just stay []). This is not
  // journey state, so it lives outside the pure reducer.
  const [roots, setRoots] = useState<RootCandidate[]>([]);
  const rootsLoaded = useRef(false);
  const loadRoots = useCallback(async () => {
    try {
      const r = await host.listRoots();
      setRoots(r);
    } catch {
      setRoots([]);
    }
  }, []);
  useEffect(() => {
    if (rootsLoaded.current) return;
    rootsLoaded.current = true;
    void loadRoots();
  }, [loadRoots]);

  // Read the latest state from a ref the reducer result updates each render.
  const stateRef = useRef(state);
  stateRef.current = state;

  const setBrief = useCallback((brief: string) => {
    dispatch({ type: 'SET_BRIEF', brief });
  }, []);

  const attach = useCallback(async (id: string, label: string) => {
    try {
      // gitStatus doubles as the reachability + allowlist probe: if the
      // sidecar refuses the path (outside ATELIER_ROOTS, missing), this
      // rejects and we surface the error instead of attaching a dead root.
      const git = await host.gitStatus(id);
      dispatch({ type: 'ATTACH', project: { id, label, git } });
    } catch (e) {
      // Surface the message on stage 1 without leaving it (ATTACH never
      // ran, so we're still on 'input'). ATTACH_FAIL is guarded to 'input'.
      dispatch({
        type: 'ATTACH_FAIL',
        error: e instanceof Error ? e.message : 'Could not attach that folder.',
      });
    }
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
    // Defense-in-depth: this is the only mutating call in the app, so guard
    // it on the stage itself (not just on which button the UI renders). A
    // stray/stale call from any other stage is a no-op.
    if (s.stage !== 'branch-prep') return;
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
          // The write payloads travel with the plan: review shows diffs, but
          // only complete preimage+replacement pairs can be applied safely.
          edits: implPlan.edits,
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

  /* ---------------------------------------------------------- */
  /* stage 8b — write-on-confirm                                 */
  /* ---------------------------------------------------------- */

  /** Run QA against whatever the root looks like now. Shared by both paths. */
  const runQa = useCallback(async (my: number) => {
    const attached = stateRef.current.attached;
    if (!attached) {
      dispatch({ type: 'QA_FAIL', error: 'No project is attached.' });
      return;
    }
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

  const openApplyConfirm = useCallback(() => {
    dispatch({ type: 'OPEN_APPLY_CONFIRM' });
  }, []);

  const confirmApply = useCallback(async () => {
    const s = stateRef.current;
    const attached = s.attached;
    // Guard on the stage, not just on which button rendered: a stray or
    // stale call from any other stage must never reach the write.
    if (s.stage !== 'apply-confirm') return;
    if (!attached) return;
    const pending = s.pendingEdits ?? [];
    if (!pending.length) return;

    const my = ++runId.current;
    dispatch({ type: 'BEGIN_APPLY' });
    let result: ApplyResult;
    try {
      // THE write. The sidecar re-validates containment + preimages itself,
      // so a stale proposal is refused rather than silently overwriting.
      result = await host.applyEdits(attached.id, pending);
    } catch (e) {
      if (my !== runId.current) return;
      // Transport/refusal error: nothing is known to have landed. Say so and
      // stay at the gate — never fall through to QA.
      dispatch({
        type: 'APPLY_FAILED',
        result: { status: 'failed', applied: [], issues: [], note: undefined },
        error: e instanceof Error ? e.message : 'Could not apply the reviewed changes.',
      });
      return;
    }
    if (my !== runId.current) return;

    if (result.status !== 'applied' && result.status !== 'simulated') {
      // conflict | failed | partial — report exactly what the host said and
      // keep the frozen batch on screen so the user can re-review.
      dispatch({ type: 'APPLY_FAILED', result });
      return;
    }

    dispatch({ type: 'APPLY_SUCCEEDED', result });
    // QA now runs against the updated root (or the untouched one, for a
    // simulated write in mock mode) — the QA copy distinguishes the two.
    await runQa(my);
  }, [runQa]);

  const skipApply = useCallback(async () => {
    const stage = stateRef.current.stage;
    if (stage !== 'review' && stage !== 'apply-confirm') return;
    const my = ++runId.current;
    // Nothing is written: no pendingEdits are sent, and the reducer drops
    // them so a later attempt can't apply a stale batch.
    dispatch({ type: 'SKIP_APPLY' });
    await runQa(my);
  }, [runQa]);

  const backFromApply = useCallback(() => {
    dispatch({ type: 'BACK_TO_REVIEW_FROM_APPLY' });
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
    hostKind: host.kind,
    roots,
    reloadRoots: loadRoots,
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
    pendingEdits: state.pendingEdits,
    applyResult: state.applyResult,
    hasDiskWrites: hasDiskWrites(state.applyResult),
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
    openApplyConfirm,
    confirmApply,
    skipApply,
    backFromApply,
    backToReview,
    reset,
    busy: isBusy(state),
  };
}
