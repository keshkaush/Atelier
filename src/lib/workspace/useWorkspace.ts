/* ============================================================
   useWorkspace — thin glue over the pure workspace machine.

   All state lives in `workspaceReducer` (./machine.ts). This hook
   only does the impure part: async orchestration through the
   HostBridge seam, the stale-result guard, and computing time-
   dependent proposals (revise/alternative need Date.now(), so they
   are built here and dispatched as finished objects — keeping the
   reducer pure and testable).
   ============================================================ */

import { useCallback, useReducer, useRef } from 'react';
import { host } from '../host';
import type { DirListing } from '../host/types';
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
import {
  displayedProposal,
  initialState,
  isBusy,
  latestVersion,
  workspaceReducer,
  type AttachedProject,
  type Stage,
} from './machine';

// Re-export the public types so existing importers keep working.
export type { Stage, AttachedProject } from './machine';

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
  error?: string;

  setBrief: (b: string) => void;
  attach: (id: string, label: string) => Promise<void>;
  detach: () => void;
  runAnalysis: () => Promise<void>;
  runDecompose: () => Promise<void>;
  /** Build the proposal from the reviewed workstreams. */
  runProposal: () => void;
  decide: (d: Decision) => void;
  /** Jump the version rail back to a past version (read-only view). */
  viewVersion: (version: number) => void;
  /** Return to the brief stage keeping the attached project. */
  backToInput: () => void;
  /** Step back from decomposition review to the analysis report. */
  backToAnalyzed: () => void;
  reset: () => void;
  /** True while any async step is in flight. Derived from stage. */
  busy: boolean;
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useWorkspace(): WorkspaceState {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);

  // Guards against overlapping async runs / late results after reset.
  const runId = useRef(0);

  // Keep imperative helpers off stale closures by reading the latest
  // state from a ref that the reducer result updates each render.
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
      await tick(360); // let the "working" state read as work
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
    // revise / alternative need the current proposal + Date.now(), so we
    // compute the next version here and dispatch it as a finished object.
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
    reset,
    busy: isBusy(state),
  };
}
