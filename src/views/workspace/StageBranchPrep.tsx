import { useEffect, useMemo, useReducer } from 'react';
import type { AttachedProject, BranchChoice } from '../../lib/workspace/useWorkspace';
import { isValidBranchName, slugToBranch } from '../../lib/workspace/useWorkspace';
import type { DesignProposal } from '../../lib/project/proposal';
import { IconGitBranch, IconArrow, IconCheck, IconRestart } from '../../components/Icons';

/* The branch-prep form is its own little machine: you decide whether to
   branch (opt-in, default off), and if so name it. A union keeps the
   "create with a name" and "skip" cases from ever blending. */
type Mode = 'skip' | 'create';

interface LocalState {
  mode: Mode;
  name: string;
  /** The name the user has actually edited (vs. the auto-slug). */
  nameEdited: boolean;
  /** Dirty-tree acknowledgement (only meaningful when the tree is dirty). */
  ackDirty: boolean;
}

type LocalAction =
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_NAME'; name: string }
  | { type: 'ACK_DIRTY'; ack: boolean }
  | { type: 'RESEED'; brief: string };

function init(brief: string): LocalState {
  return { mode: 'skip', name: slugToBranch(brief), nameEdited: false, ackDirty: false };
}

function reducer(s: LocalState, a: LocalAction): LocalState {
  switch (a.type) {
    case 'SET_MODE':
      return { ...s, mode: a.mode };
    case 'SET_NAME':
      return { ...s, name: a.name, nameEdited: true };
    case 'ACK_DIRTY':
      return { ...s, ackDirty: a.ack };
    case 'RESEED':
      // Brief changed → re-slug only if the user hasn't customised it.
      return { ...s, name: s.nameEdited ? s.name : slugToBranch(a.brief) };
    default:
      return s;
  }
}

/**
 * Stage 6 — branch preparation. Opt-in branch creation with an editable
 * name, live validation, and an honest dirty-tree warning. The copy is
 * explicit that Atelier never stashes — if you're dirty you either
 * acknowledge and proceed on the tree, or you don't branch. Creating is
 * the only disk-mutating action in the whole journey, and it happens
 * only on the explicit button press here.
 */
export function StageBranchPrep({
  brief,
  attached,
  proposal,
  branch,
  busy,
  error,
  canAdvance,
  onCreate,
  onSkip,
  onBack,
}: {
  brief: string;
  attached?: AttachedProject;
  proposal?: DesignProposal;
  branch?: BranchChoice;
  busy: boolean;
  error?: string;
  canAdvance: boolean;
  onCreate: (choice: BranchChoice) => void;
  onSkip: (choice: BranchChoice) => void;
  onBack: () => void;
}) {
  const [local, dispatch] = useReducer(reducer, brief, init);

  // Re-seed the name when the brief changes (never clobbers a custom name).
  useEffect(() => {
    dispatch({ type: 'RESEED', brief });
  }, [brief]);

  const git = attached?.git;
  const isRepo = Boolean(git?.isRepo);
  const dirty = Boolean(git?.dirty);
  const current = git?.branch ?? branch?.currentBranch;

  const nameValid = isValidBranchName(local.name);
  const nameError =
    local.mode === 'create' && local.name.length > 0 && !nameValid
      ? 'Use lower-case letters, digits, and . _ / - only; must start with a letter or digit.'
      : undefined;

  // The button is live only when the derived guard AND the local ack agree.
  const blockedByAck = local.mode === 'create' && dirty && !local.ackDirty;
  const blockedByName = local.mode === 'create' && !nameValid;
  const blockedByRepo = local.mode === 'create' && !isRepo;
  const canSubmit = canAdvance && !blockedByAck && !blockedByName && !blockedByRepo && !busy;

  const buildChoice = useMemo(
    (): BranchChoice => ({
      mode: local.mode,
      name: local.mode === 'create' ? local.name : undefined,
      currentBranch: current,
      dirtyAcknowledged: dirty ? local.ackDirty : true,
    }),
    [local.mode, local.name, local.ackDirty, current, dirty],
  );

  return (
    <div className="stage stage--branch">
      <div className="stage__intro">
        <p className="stage__kicker">Step six — branch prep</p>
        <h2 className="stage__title">
          Optionally, give this change <em>its own branch</em>.
        </h2>
        <p className="stage__lede">
          Branching is opt-in and off by default. If you turn it on, Atelier runs
          one command — <span className="mono">git checkout -b</span>. It never
          stashes, never commits, never touches your uncommitted work.
        </p>
      </div>

      {/* current repository state */}
      <div className="branch-state">
        <div className="branch-state__row">
          <span className="branch-state__k">Current branch</span>
          <span className="branch-state__v mono">
            <IconGitBranch size={14} />
            {isRepo ? current ?? 'detached HEAD' : 'not a git repository'}
          </span>
        </div>
        <div className="branch-state__row">
          <span className="branch-state__k">Working tree</span>
          <span className={`branch-state__pill ${dirty ? 'is-dirty' : isRepo ? 'is-clean' : 'is-none'}`}>
            {!isRepo
              ? 'no git'
              : dirty
                ? 'uncommitted changes'
                : 'clean'}
          </span>
        </div>
        {isRepo && (git?.ahead != null || git?.behind != null) && (
          <div className="branch-state__row">
            <span className="branch-state__k">vs. upstream</span>
            <span className="branch-state__v mono">
              {git?.ahead ?? 0} ahead · {git?.behind ?? 0} behind
            </span>
          </div>
        )}
      </div>

      {/* the opt-in toggle */}
      <div className="branch-choice">
        <label className={`branch-opt ${local.mode === 'create' ? 'is-on' : ''}`}>
          <input
            type="checkbox"
            checked={local.mode === 'create'}
            disabled={!isRepo || busy}
            onChange={(e) =>
              dispatch({ type: 'SET_MODE', mode: e.target.checked ? 'create' : 'skip' })
            }
          />
          <span className="branch-opt__box" aria-hidden>
            {local.mode === 'create' && <IconCheck size={13} />}
          </span>
          <span className="branch-opt__label">Create a branch for this change</span>
        </label>

        {!isRepo && (
          <p className="branch-note branch-note--warn">
            This folder isn’t a git repository, so there’s no branch to create. You
            can still continue — nothing is written until you confirm the apply.
          </p>
        )}

        {local.mode === 'create' && isRepo && (
          <div className="branch-name">
            <label className="branch-name__label" htmlFor="branch-name">
              New branch name
            </label>
            <input
              id="branch-name"
              className={`branch-name__input mono ${nameError ? 'is-invalid' : ''}`}
              value={local.name}
              spellCheck={false}
              disabled={busy}
              onChange={(e) => dispatch({ type: 'SET_NAME', name: e.target.value })}
            />
            {nameError ? (
              <p className="branch-name__error">{nameError}</p>
            ) : (
              <p className="branch-name__hint">
                Pre-filled from your brief. Edit freely — it’s validated as you type.
              </p>
            )}
          </div>
        )}
      </div>

      {/* dirty-tree warning + acknowledgement */}
      {dirty && (
        <div className="dirty-warn" role="alert">
          <div className="dirty-warn__head">
            <span className="dirty-warn__title">The working tree has uncommitted changes</span>
          </div>
          <p className="dirty-warn__body">
            A new branch starts from the current tree, so those changes come with
            it. <strong>Atelier never stashes your changes.</strong> Commit or set
            them aside first if you want a clean branch.
          </p>
          <label className="dirty-warn__ack">
            <input
              type="checkbox"
              checked={local.ackDirty}
              onChange={(e) => dispatch({ type: 'ACK_DIRTY', ack: e.target.checked })}
            />
            <span>
              I understand my uncommitted changes will carry onto the new branch.
            </span>
          </label>
        </div>
      )}

      {error && <div className="ws-error" role="alert">{error}</div>}

      {/* footer summary of what will happen */}
      <div className="branch-summary">
        <span className="branch-summary__k">On continue</span>
        <span className="branch-summary__v">
          {local.mode === 'create' && isRepo
            ? `Create and switch to ${local.name || '…'}, then final approval.`
            : `Stay on ${current ?? 'the current branch'} — no branch created; final approval next.`}
        </span>
      </div>

      <div className="stage__actions">
        <button className="btn btn--ghost" type="button" onClick={onBack} disabled={busy}>
          <IconRestart size={15} /> Back to proposal
        </button>
        <div className="stage__actions-right">
          {local.mode === 'create' && isRepo ? (
            <button
              className="btn btn--solid"
              type="button"
              disabled={!canSubmit}
              onClick={() => onCreate(buildChoice)}
            >
              <IconGitBranch size={15} /> Create branch & continue
            </button>
          ) : (
            <button
              className="btn btn--solid"
              type="button"
              disabled={!canSubmit}
              onClick={() => onSkip(buildChoice)}
            >
              Continue without a branch <IconArrow size={16} />
            </button>
          )}
        </div>
      </div>

      {proposal && (
        <p className="branch-footnote mono">
          Approving v{proposal.version} · {proposal.impact.files.length} file
          {proposal.impact.files.length === 1 ? '' : 's'} in scope
        </p>
      )}
    </div>
  );
}
