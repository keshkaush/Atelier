import type { DesignProposal } from '../../lib/project/proposal';

/**
 * The proposal's honest history. v1 → v(n). Clicking a past version
 * pins it read-only; clicking the latest returns to live.
 */
export function VersionRail({
  versions,
  current,
  viewingVersion,
  onView,
}: {
  versions: DesignProposal[];
  current: number;
  viewingVersion: number | null;
  onView: (v: number) => void;
}) {
  if (versions.length < 2) return null;
  return (
    <div className="vrail" aria-label="Proposal versions">
      <div className="vrail__head">
        <span>Versions</span>
        <span className="vrail__count">{versions.length}</span>
      </div>
      <ol className="vrail__list">
        {versions.map((v) => {
          const isLatest = v.version === current;
          const isViewing =
            viewingVersion === v.version || (viewingVersion === null && isLatest);
          return (
            <li key={v.version}>
              <button
                type="button"
                className={`vrail__item ${isViewing ? 'is-viewing' : ''}`}
                onClick={() => onView(v.version)}
              >
                <span className="vrail__v">
                  v{v.version}
                  {isLatest && <em className="vrail__latest">latest</em>}
                </span>
                <span className="vrail__note">
                  {v.changeNote ?? 'Initial proposal'}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
