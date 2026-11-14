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
     any ──RESET──▶ initial
     any ──DETACH──▶ input (project + downstream cleared)

   `viewingVersion` overlays any proposal-bearing stage: non-null
   means the rail is pinned to a past version (read-only).
   ============================================================ */

import type { DirListing, GitStatus } from '../host/types';
import type { ProjectAnalysis } from '../project/analyze';
import type { Workstream } from '../project/decompose';
import type { DesignProposal } from '../project/proposal';

export type Stage =
  | 'input'
  | 'analyzing'
  | 'analyzed'
  | 'decomposing'
  | 'decomposed'
  | 'proposal'
  | 'approved';

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
  error?: string;
}

export const initialState: WsState = {
  stage: 'input',
  brief: '',
  versions: [],
  viewingVersion: null,
};

/* ---------------------------------------------------------- */
/* Actions                                                     */
/* ---------------------------------------------------------- */

export type WsAction =
  | { type: 'SET_BRIEF'; brief: string }
  | { type: 'ATTACH'; project: AttachedProject }
  | { type: 'DETACH' }
  | { type: 'BEGIN_ANALYSIS' }
  | { type: 'ANALYSIS_OK'; listing: DirListing; analysis: ProjectAnalysis }
  | { type: 'ANALYSIS_FAIL'; error: string }
  | { type: 'BEGIN_DECOMPOSE' }
  | { type: 'DECOMPOSE_OK'; workstreams: Workstream[] }
  | { type: 'DECOMPOSE_FAIL'; error: string }
  | { type: 'PROPOSAL_BUILT'; proposal: DesignProposal }
  | { type: 'PROPOSAL_APPEND'; proposal: DesignProposal }
  | { type: 'APPROVE' }
  | { type: 'CANCEL' }
  | { type: 'VIEW_VERSION'; version: number }
  | { type: 'BACK_TO_INPUT' }
  | { type: 'BACK_TO_ANALYZED' }
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
      return { ...state, stage: 'decomposing', error: undefined };

    case 'DECOMPOSE_OK':
      if (state.stage !== 'decomposing') return state;
      return { ...state, stage: 'decomposed', workstreams: action.workstreams };

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
      };

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

    case 'BACK_TO_INPUT':
      // Return to the brief/attach stage but KEEP the attached project and
      // its analysis, so the user can edit the brief and re-run without
      // re-attaching. Clears only the decomposition/proposal downstream.
      return {
        ...state,
        stage: 'input',
        workstreams: undefined,
        versions: [],
        viewingVersion: null,
        error: undefined,
      };

    case 'BACK_TO_ANALYZED':
      // Step back from the decomposition review to the analysis report
      // without re-running analysis. Clears the decomposed workstreams.
      if (state.stage !== 'decomposed') return state;
      return { ...state, stage: 'analyzed', workstreams: undefined };

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

/** In-flight is fully determined by the two transient stages. */
export function isBusy(state: WsState): boolean {
  return state.stage === 'analyzing' || state.stage === 'decomposing';
}
