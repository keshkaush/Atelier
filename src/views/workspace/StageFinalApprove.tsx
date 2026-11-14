import type { AttachedProject, BranchChoice } from '../../lib/workspace/useWorkspace';
import type { DesignProposal } from '../../lib/project/proposal';
import { IconGitBranch, IconCheck, IconArrow, IconRestart } from '../../components/Icons';

/**
 * Stage 7 — the final approval gate. The last screen before any file work.
 * It restates the whole commitment on one page: which proposal version,
 * which branch (or none), what impact. One explicit approve leads to the
 * dry-run implementation. Nothing has been written to reach this point
 * except (optionally) the branch the user themselves chose.
 */
export function StageFinalApprove({
  proposal,
  attached,
  branch,
  busy,
  onApprove,
  onBackToBranch,
  onBackToProposal,
}: {
  proposal?: DesignProposal;
  attached?: AttachedProject;
  branch?: BranchChoice;
  busy: boolean;
  onApprove: () => void;
  onBackToBranch: () => void;
  onBackToProposal: () => void;
}) {
  if (!proposal) return null;

  const branching = branch?.mode === 'create';
  const branchLabel = branching
    ? branch?.created ?? branch?.name ?? 'new branch'
    : branch?.currentBranch ?? attached?.git.branch ?? 'current branch';

  const files = proposal.impact.files.length;

  return (
    <div className="stage stage--final">
      <div className="stage__intro">
        <p className="stage__kicker">Step seven — final approval</p>
        <h2 className="stage__title">
          The last gate. <em>Then</em> the studio drafts the change.
        </h2>
        <p className="stage__lede">
          Check the commitment below. Approving moves to a generated,
          reviewable diff — a dry run. This milestone never writes to your files;
          applying the diff stays your call, in your editor.
        </p>
      </div>

      <div className="final-card">
        <div className="final-card__grid">
          <div className="final-card__item">
            <span className="final-card__k">Proposal</span>
            <span className="final-card__v">
              v{proposal.version}
              <span className="final-card__sub">{proposal.design.headline}</span>
            </span>
          </div>

          <div className="final-card__item">
            <span className="final-card__k">Branch</span>
            <span className="final-card__v mono">
              <IconGitBranch size={14} />
              {branchLabel}
              {!branching && <span className="final-card__sub">no branch created</span>}
            </span>
          </div>

          <div className="final-card__item">
            <span className="final-card__k">Impact</span>
            <span className="final-card__v">
              {files} file{files === 1 ? '' : 's'} in scope
              <span className="final-card__sub">
                +{proposal.impact.adds} · ~{proposal.impact.edits} · −{proposal.impact.removes}
              </span>
            </span>
          </div>

          <div className="final-card__item">
            <span className="final-card__k">Writes</span>
            <span className="final-card__v">
              None
              <span className="final-card__sub">dry-run diff only</span>
            </span>
          </div>
        </div>

        {proposal.impact.files.length > 0 && (
          <div className="final-card__files">
            {proposal.impact.files.map((f) => (
              <span className="final-card__file mono" key={f}>
                {f}
              </span>
            ))}
          </div>
        )}

        <div className="final-card__assurance">
          <IconCheck size={15} />
          <span>
            Atelier will read these files to draft a diff. It will not write,
            stage, commit, or stash anything.
          </span>
        </div>
      </div>

      <div className="stage__actions">
        <div className="stage__actions-left">
          <button className="btn btn--ghost" type="button" onClick={onBackToBranch} disabled={busy}>
            <IconRestart size={15} /> Branch prep
          </button>
          <button className="btn btn--ghost" type="button" onClick={onBackToProposal} disabled={busy}>
            Proposal
          </button>
        </div>
        <button className="btn btn--solid" type="button" onClick={onApprove} disabled={busy}>
          <IconCheck size={16} /> Final approve — begin implementation
          <IconArrow size={16} />
        </button>
      </div>
    </div>
  );
}
