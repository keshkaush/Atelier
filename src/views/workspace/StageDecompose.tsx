import { DESKS, type DeskId } from '../../lib/studio';
import type { Workstream, Risk } from '../../lib/project/decompose';

const DESK_NAME: Record<DeskId, string> = DESKS.reduce(
  (acc, d) => ({ ...acc, [d.id]: d.name }),
  {} as Record<DeskId, string>,
);

const RISK_LABEL: Record<Risk, string> = { low: 'Low risk', med: 'Watch', high: 'Careful' };
const riskDot = (r: Risk) =>
  r === 'high' ? 'dot dot--warn' : r === 'med' ? 'dot dot--working' : 'dot dot--queued';

/**
 * Stage 3 — the brief split across the five desks, grounded in real
 * paths. When `busy`, workstreams reveal one by one; when done, all
 * are visible. Reuses the desk-card idiom for continuity with the board.
 */
export function StageDecompose({
  workstreams,
  busy,
  pendingLabel = 'Decomposing…',
  onNext,
  onBack,
}: {
  workstreams?: Workstream[];
  busy: boolean;
  /** What the pending card says — the same stage covers the model call
   *  that drafts the proposal, which is not "decomposing" any more. */
  pendingLabel?: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const list = workstreams ?? [];

  return (
    <div className="stage stage--decompose">
      <div className="stage__intro">
        <p className="stage__kicker">Step three — decomposition</p>
        <h2 className="stage__title">
          The Lead splits the brief <em>across the floor</em>.
        </h2>
        <p className="stage__lede">
          Each workstream is owned by one desk and grounded in the files it will
          touch. This is the semantic plan the proposal is built on.
        </p>
      </div>

      <div className="wslist">
        {list.map((w, i) => (
          <article
            className="ws"
            key={w.id}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="ws__top">
              <span className={riskDot(w.risk)} />
              <span className="ws__title">{w.title}</span>
              <span className="ws__desk">{DESK_NAME[w.desk]}</span>
              <span className={`ws__risk ws__risk--${w.risk}`}>{RISK_LABEL[w.risk]}</span>
            </div>
            <p className="ws__scope">{w.scope}</p>
            {w.touches.length > 0 && (
              <div className="ws__touches">
                {w.touches.map((t) => (
                  <span className="ws__touch mono" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
        {busy && (
          <div className="ws ws--pending">
            <div className="ws__top">
              <span className="dot dot--working" />
              <span className="ws__title">{pendingLabel}</span>
            </div>
          </div>
        )}
      </div>

      <div className="stage__actions">
        <button className="btn btn--ghost" type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <button
          className="btn btn--solid"
          type="button"
          onClick={onNext}
          disabled={busy || list.length === 0}
        >
          Draft the proposal
        </button>
      </div>
    </div>
  );
}
