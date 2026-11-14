import type { ImplementationPlanState } from '../../lib/workspace/useWorkspace';
import { DiffView } from './DiffView';
import { IconCheck, IconClose, IconArrow } from '../../components/Icons';

/**
 * Stage 8 — implementation review. The generated dry-run diffs, one card
 * per file, each with an accept/skip toggle (UI state only). The copy is
 * unambiguous: nothing here is applied. Accepting marks a file as "in" for
 * the plan's summary; it never writes to disk.
 */
export function StageReview({
  plan,
  decisions,
  onDecision,
  onAll,
  busy,
  onNext,
  onBack,
}: {
  plan: ImplementationPlanState;
  decisions: Record<string, 'accept' | 'skip'>;
  onDecision: (path: string, decision: 'accept' | 'skip') => void;
  onAll: (decision: 'accept' | 'skip') => void;
  busy: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  const changed = plan.diffs.filter((d) => d.status !== 'unchanged');
  const unchanged = plan.diffs.filter((d) => d.status === 'unchanged');
  const accepted = changed.filter((d) => decisions[d.path] === 'accept');

  return (
    <div className="stage stage--review">
      <div className="stage__intro">
        <p className="stage__kicker">Step eight — implementation (dry run)</p>
        <h2 className="stage__title">
          A reviewable diff. <em>Nothing</em> is applied.
        </h2>
        <p className="stage__lede">
          These are proposed changes shaped from the plan and your project’s real
          files. Accept or skip each file to mark what belongs in the plan. No file
          is written in this milestone — you apply diffs yourself, in your editor.
        </p>
      </div>

      <div className="review-bar">
        <div className="review-bar__counts">
          <span className="review-bar__count">
            <strong>{plan.totals.files}</strong> files changed
          </span>
          <span className="review-bar__count review-bar__count--add">
            +{plan.totals.adds}
          </span>
          <span className="review-bar__count review-bar__count--del">
            −{plan.totals.dels}
          </span>
        </div>
        <div className="review-bar__actions">
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => onAll('accept')}
            disabled={busy}
          >
            Accept all
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => onAll('skip')}
            disabled={busy}
          >
            Skip all
          </button>
        </div>
      </div>

      {plan.skipped.length > 0 && (
        <div className="review-skipped">
          <span className="review-skipped__k">Couldn’t diff</span>
          <ul>
            {plan.skipped.map((s) => (
              <li key={s.path} className="mono">
                {s.path} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {changed.length === 0 ? (
        <div className="review-empty">
          <p>
            The plan didn’t resolve to any concrete file changes to review. You can
            still run QA, or go back to adjust the proposal.
          </p>
        </div>
      ) : (
        <div className="review-list">
          {changed.map((d) => {
            const accepted = decisions[d.path] === 'accept';
            return (
              <div className={`review-card ${accepted ? 'is-accepted' : 'is-skipped'}`} key={d.path}>
                <div className="review-card__bar">
                  <span className={`review-card__state ${accepted ? 'is-accepted' : 'is-skipped'}`}>
                    {accepted ? <IconCheck size={13} /> : <IconClose size={13} />}
                    {accepted ? 'In the plan' : 'Skipped'}
                  </span>
                  <div className="review-card__toggle">
                    <button
                      type="button"
                      className={`chip ${accepted ? 'is-on' : ''}`}
                      onClick={() => onDecision(d.path, 'accept')}
                      disabled={busy}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className={`chip ${!accepted ? 'is-on' : ''}`}
                      onClick={() => onDecision(d.path, 'skip')}
                      disabled={busy}
                    >
                      Skip
                    </button>
                  </div>
                </div>
                <DiffView diff={d} />
              </div>
            );
          })}
        </div>
      )}

      {unchanged.length > 0 && (
        <p className="review-unchanged mono">
          {unchanged.length} file{unchanged.length === 1 ? '' : 's'} left unchanged by the
          plan: {unchanged.map((d) => d.path).join(', ')}
        </p>
      )}

      <div className="stage__actions">
        <button className="btn btn--ghost" type="button" onClick={onBack} disabled={busy}>
          Back
        </button>
        <div className="stage__actions-right">
          <span className="stage__hint">
            {accepted.length} of {changed.length} file
            {changed.length === 1 ? '' : 's'} marked in the plan
          </span>
          <button className="btn btn--solid" type="button" onClick={onNext} disabled={busy}>
            Run verification <IconArrow size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
