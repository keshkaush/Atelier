import type { DesignProposal } from '../../lib/project/proposal';
import { IconCheck, IconGitBranch, IconRestart } from '../../components/Icons';

/**
 * The holding state after approval. Milestone 1 stops here by design:
 * branch preparation, implementation and QA are Milestone 2. This card
 * makes the boundary explicit rather than faking a build.
 */
export function StageApproved({
  proposal,
  onReset,
}: {
  proposal: DesignProposal;
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
            <IconGitBranch size={16} /> Next — Milestone 2
          </div>
          <ul className="approved__steps">
            <li>Git branch preparation — opt-in, editable name, dirty-tree warning, never auto-stash.</li>
            <li>Final approval gate.</li>
            <li>Implementation with a reviewable diff.</li>
            <li>QA / verification report.</li>
          </ul>
        </div>

        <button className="btn btn--solid" type="button" onClick={onReset}>
          <IconRestart size={15} /> Start another brief
        </button>
      </div>
    </div>
  );
}
