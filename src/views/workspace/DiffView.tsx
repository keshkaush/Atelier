import type { FileDiff } from '../../lib/project/diff';

/**
 * Renders one file's unified diff: a hairline frame, a header with the
 * path + add/del counts, then the hunks. Colour is status-only — green
 * for additions, the warm warn tone for deletions, muted ink for context —
 * the same rule the rest of the studio follows.
 */
export function DiffView({ diff }: { diff: FileDiff }) {
  return (
    <div className={`diff diff--${diff.status}`}>
      <div className="diff__head">
        <span className="diff__path mono">{diff.path}</span>
        <span className="diff__stats">
          <span className="diff__stat diff__stat--add">+{diff.adds}</span>
          <span className="diff__stat diff__stat--del">−{diff.dels}</span>
          {diff.status === 'added' && <span className="diff__badge">new file</span>}
          {diff.status === 'unchanged' && <span className="diff__badge diff__badge--muted">no change</span>}
        </span>
      </div>

      {diff.note && <p className="diff__note">{diff.note}</p>}

      {diff.hunks.length === 0 ? (
        <p className="diff__empty">No line changes proposed for this file.</p>
      ) : (
        <div className="diff__body">
          {diff.hunks.map((h, hi) => (
            <div className="diff__hunk" key={hi}>
              <div className="diff__hunk-head mono">{h.header}</div>
              {h.lines.map((l, li) => (
                <div className={`diff__line diff__line--${l.kind}`} key={li}>
                  <span className="diff__gutter mono">
                    <span className="diff__no">{l.oldNo ?? ''}</span>
                    <span className="diff__no">{l.newNo ?? ''}</span>
                  </span>
                  <span className="diff__sign mono">
                    {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                  </span>
                  <span className="diff__text mono">{l.text || ' '}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
