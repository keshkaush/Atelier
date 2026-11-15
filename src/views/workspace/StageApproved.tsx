import type { DesignProposal } from '../../lib/project/proposal';
import { IconCheck, IconGitBranch, IconRestart, IconArrow } from '../../components/Icons';

/**
 * The holding state after proposal approval. In Milestone 2 this is no
 * longer a dead end — "Continue to branch prep" opens stage 6. It restates
 * that approval authorised the next stage and nothing has touched disk yet.
 */
export function StageApproved({
  proposal,
  onContinue,
  onReset,
}: {
  proposal: DesignProposal;
  onContinue: () => void;
  onReset: () => void;
}) {
  return (
    <div className="stage stage--approved">
      <div className="approved">
        <span className="approved__seal">
          <IconCheck size={26} />
        </span>
        <p className="stage__kicker">Step five — approved</p>
        <h2 className="stage__title">
          Proposal v{proposal.version} <em>approved</em>.
        </h2>
        <p className="approved__body">
          {proposal.design.headline} — signed off. Nothing has been written to disk;
          approval authorises the next stage.
        </p>

        <div className="approved__next">
          <div className="approved__next-head">
            <IconGitBranch size={16} /> Next
          </div>
          <ul className="approved__steps">
            <li>Branch preparation — opt-in, editable name, dirty-tree warning, never auto-stash.</li>
            <li>Final approval gate — the last screen before any file work.</li>
            <li>Implementation — a reviewable diff, one accept/skip decision per file.</li>
            <li>Apply gate — the single place accepted files are written, and only on confirm.</li>
            <li>QA / verification — the project’s own typecheck, lint and tests.</li>
          </ul>
        </div>

        <div className="approved__actions">
          <button className="btn btn--ghost" type="button" onClick={onReset}>
            <IconRestart size={15} /> Start another brief
          </button>
          <button className="btn btn--solid" type="button" onClick={onContinue}>
            Continue to branch prep <IconArrow size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
