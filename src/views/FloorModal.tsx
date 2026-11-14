import { useEffect, useRef, type MouseEvent } from 'react';
import { DESKS } from '../lib/studio';
import { OrgChart } from '../components/OrgChart';

/**
 * The floor — the studio org chart, colophon and roster — presented as a
 * modal. Opened from the Run console; the run console itself is the home.
 */
export function FloorModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc closes; lock body scroll; move focus into the dialog.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="scrim"
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="dialog__bar">
          <span id="floor-title" className="dialog__title">
            The floor — how the studio is organised
          </span>
          <button
            className="dialog__close"
            onClick={onClose}
            aria-label="Close the floor"
            type="button"
          >
            Close ✕
          </button>
        </div>

        <div className="dialog__body">
          <header className="masthead masthead--compact">
            <div>
              <p className="masthead__kicker">A studio run by agents</p>
              <h1 className="masthead__title">
                Every brief, <em>routed</em> to the right desk.
              </h1>
              <p className="masthead__lede">
                You brief the Design Lead. The Lead sets direction, splits the
                work, and dispatches five specialists — research, structure,
                surface, voice, and memory. This is the floor where it happens.
              </p>
            </div>
            <div className="masthead__meta">
              <strong>Open for briefs</strong>
              5 desks online
              <br />
              avg. run · 8 min
              <br />
              memory · persistent
            </div>
          </header>

          <OrgChart />

          <section className="section" aria-label="Studio at a glance">
            <div className="colophon">
              <div className="colophon__cell">
                <div className="colophon__num">1</div>
                <p className="colophon__label">
                  Design Lead — direction and the quality gate on every run.
                </p>
              </div>
              <div className="colophon__cell">
                <div className="colophon__num">5</div>
                <p className="colophon__label">
                  desks working in parallel from a single brief.
                </p>
              </div>
              <div className="colophon__cell">
                <div className="colophon__num">21</div>
                <p className="colophon__label">
                  deliverables per run, from wireframes to style guide.
                </p>
              </div>
              <div className="colophon__cell">
                <div className="colophon__num">
                  <em>∞</em>
                </div>
                <p className="colophon__label">
                  institutional memory — decisions logged, state preserved.
                </p>
              </div>
            </div>
          </section>

          <section className="section" aria-label="Roster">
            <div className="section__head">
              <h2>The roster</h2>
              <span className="note">who does what — and how long it takes</span>
            </div>

            <div className="ledger">
              {DESKS.map((d, i) => (
                <article className="ledger__row" key={d.id}>
                  <div className="ledger__idx">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="ledger__id">
                    <span className="ledger__name">{d.name}</span>
                    <span className="ledger__role">{d.role}</span>
                  </div>
                  <div>
                    <p className="ledger__brief">{d.dossier}</p>
                    <div className="ledger__caps">
                      {d.skills.map((s) => (
                        <span className="node__chip" key={s}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="ledger__stat">
                    <span>{d.turnaround}</span>
                    <b>{d.yield}</b>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
