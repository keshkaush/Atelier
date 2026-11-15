import type { ApplyResult, FileEdit } from '../../lib/host/types';
import { IconArrow, IconCheck, IconClose, IconRestart, IconSpark } from '../../components/Icons';

/**
 * Stage 8b — the apply confirmation gate. This is the only screen in the
 * studio whose primary action writes to disk.
 *
 * The batch shown here was frozen when the user left review, so what is
 * listed is exactly what a confirmation would write — review decisions can
 * no longer drift underneath it. Nothing has been written yet, and the
 * back action un-freezes the batch so a later confirmation needs a fresh
 * review.
 */
export function StageApply({
  pendingEdits,
  applyResult,
  hostKind,
  busy,
  error,
  onConfirm,
  onSkip,
  onBack,
}: {
  pendingEdits: FileEdit[];
  applyResult?: ApplyResult;
  hostKind: 'mock' | 'local';
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const count = pendingEdits.length;
  const creates = pendingEdits.filter((e) => e.original === null);
  const modifies = pendingEdits.filter((e) => e.original !== null);
  const mock = hostKind === 'mock';

  // Only a non-success result is worth reporting here; a success moves on.
  const failed = applyResult && applyResult.status !== 'applied' && applyResult.status !== 'simulated'
    ? applyResult
    : undefined;

  const noun = count === 1 ? 'file' : 'files';
  const confirmLabel = mock ? `Simulate writing ${count} ${noun}` : `Write ${count} ${noun} to disk`;

  return (
    <div className="stage stage--apply">
      <div className="stage__intro">
        <p className="stage__kicker">Step eight — write to disk</p>
        <h2 className="stage__title">
          {count === 0 ? (
            <>Nothing is <em>selected</em>. Nothing would be written.</>
          ) : mock ? (
            <>
              This would write <em>{count}</em> {noun}.
            </>
          ) : (
            <>
              Write <em>{count}</em> {noun} to your project.
            </>
          )}
        </h2>
        <p className="stage__lede">
          {mock
            ? 'The mock host never touches disk, so confirming is a dry run: it reports what the local host would do, then runs verification unchanged.'
            : 'Confirming replaces the files listed below with the accepted versions. Every file is checked against the exact contents the proposal was generated from — if anything changed on disk since then, nothing is written and you’ll see which files diverged.'}
        </p>
      </div>

      {count > 0 && (
        <div className="apply-batch">
          <div className="apply-batch__head">
            <span>Frozen batch</span>
            <span className="apply-batch__counts mono">
              {creates.length > 0 && <span className="apply-batch__count">{creates.length} create</span>}
              {modifies.length > 0 && <span className="apply-batch__count">{modifies.length} modify</span>}
            </span>
          </div>
          <ul className="apply-list">
            {pendingEdits.map((e) => (
              <li className="apply-item" key={e.path}>
                <span
                  className={`apply-item__kind ${e.original === null ? 'is-create' : 'is-modify'}`}
                  aria-hidden="true"
                >
                  {e.original === null ? '+' : '~'}
                </span>
                <span className="apply-item__path mono">{e.path}</span>
                <span className="apply-item__action">
                  {e.original === null ? 'new file' : 'overwrite'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {failed && (
        <div className={`apply-failure apply-failure--${failed.status}`} role="alert">
          <div className="apply-failure__head">
            <IconSpark size={16} />
            <strong>
              {failed.status === 'conflict' && 'Nothing was written — the files moved on.'}
              {failed.status === 'failed' && 'Nothing was written.'}
              {failed.status === 'partial' && 'Only part of the batch was written.'}
            </strong>
          </div>
          {(failed.note || error) && (
            <p className="apply-failure__note">{error ?? failed.note}</p>
          )}
          {failed.issues.length > 0 && (
            <ul className="apply-failure__issues">
              {failed.issues.map((i) => (
                <li key={i.path}>
                  <span className="mono">{i.path}</span> — {i.reason}
                </li>
              ))}
            </ul>
          )}
          {failed.applied.length > 0 && (
            <div className="apply-failure__applied">
              <span className="apply-failure__applied-k">Actually written</span>
              <ul>
                {failed.applied.map((p) => (
                  <li key={p} className="mono">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="apply-failure__next">
            Go back to review, then generate a fresh proposal before applying again.
          </p>
        </div>
      )}

      {count === 0 && (
        <div className="review-empty">
          <p>
            Every file was skipped, so there is nothing to write. Continue to
            verification to check the project as it stands.
          </p>
        </div>
      )}

      <div className="stage__actions">
        <button className="btn btn--ghost" type="button" onClick={onBack} disabled={busy}>
          <IconRestart size={15} /> Back to review
        </button>
        <div className="stage__actions-right">
          <button className="btn btn--ghost" type="button" onClick={onSkip} disabled={busy}>
            Skip — verify without writing
          </button>
          <button
            className="btn btn--solid"
            type="button"
            onClick={count === 0 ? onSkip : onConfirm}
            disabled={busy}
          >
            {count === 0 ? (
              <>Run verification <IconArrow size={16} /></>
            ) : mock ? (
              <><IconClose size={15} /> {confirmLabel}</>
            ) : (
              <><IconCheck size={16} /> {confirmLabel}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
