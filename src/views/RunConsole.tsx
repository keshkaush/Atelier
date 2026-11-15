import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { DESKS, WHO_LABEL, PRESETS, type Phase } from '../lib/studio';
import { useRunner } from '../lib/useRunner';
import { IconArrow, IconRestart } from '../components/Icons';

const PHASE_LABEL: Record<Phase, string> = {
  queued: 'Queued',
  working: 'Working',
  done: 'Delivered',
};

const dotClass = (p: Phase) =>
  p === 'working' ? 'dot dot--working' : p === 'done' ? 'dot dot--done' : 'dot dot--queued';

function fmtClock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function RunConsole() {
  const [brief, setBrief] = useState(PRESETS[0].brief);
  const runner = useRunner(700);
  const logRef = useRef<HTMLDivElement>(null);

  const running = runner.status === 'running';
  const doneDesks = DESKS.filter((d) => runner.desks[d.id].phase === 'done').length;
  const workingDesks = DESKS.filter(
    (d) => runner.desks[d.id].phase === 'working',
  ).length;

  // Auto-scroll the log.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [runner.log.length]);

  const canStart = brief.trim().length > 8 && !running;

  const verdict = useMemo(() => {
    if (runner.status === 'complete') return 'Complete';
    if (running) return 'In session';
    return 'Awaiting brief';
  }, [runner.status, running]);

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <p className="masthead__kicker">A studio run by agents</p>
          <h1 className="masthead__title">
            Every brief, <em>routed</em> to the right desk.
          </h1>
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

      <section className="composer" aria-label="Brief the studio">
        <div className="composer__field">
          <label className="composer__label" htmlFor="brief">
            What should the studio make?
          </label>
          <textarea
            id="brief"
            value={brief}
            spellCheck={false}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBrief(e.target.value)}
            placeholder="Describe a screen, a flow, a page…"
            disabled={running}
          />
        </div>
        <div className="composer__row">
          <div className="presets" role="group" aria-label="Preset briefs">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="preset"
                type="button"
                disabled={running}
                onClick={() => setBrief(p.brief)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(runner.status === 'complete' || runner.status === 'running') && (
              <button className="btn btn--ghost btn--sm" onClick={runner.reset} type="button">
                <IconRestart size={15} /> Reset
              </button>
            )}
            <button
              className="btn btn--solid"
              type="button"
              disabled={!canStart}
              onClick={() => runner.start(brief)}
            >
              {running ? 'Working…' : 'Dispatch brief'}
              {!running && <IconArrow size={16} />}
            </button>
          </div>
        </div>
      </section>

      <div className="runbar" aria-label="Run status">
        <div className="runbar__seg">
          <span className="runbar__k">Status</span>
          <span className="runbar__v">{verdict}</span>
        </div>
        <div className="runbar__seg">
          <span className="runbar__k">Desks delivered</span>
          <span className="runbar__v">
            {doneDesks}/{DESKS.length}
          </span>
        </div>
        <div className="runbar__seg">
          <span className="runbar__k">Working now</span>
          <span className="runbar__v">{workingDesks}</span>
        </div>
        <div className="runbar__seg">
          <span className="runbar__k">Elapsed</span>
          <span className="runbar__v">{fmtClock(runner.elapsed)}</span>
        </div>
        <div className="runbar__seg progress">
          <span className="runbar__k">Progress · {runner.progress}%</span>
          <div className="progress__track">
            <div className="progress__fill" style={{ width: `${runner.progress}%` }} />
          </div>
        </div>
      </div>

      <div className="run">
        <div className="board" aria-label="Desk board">
          {/* Lead card first */}
          <article
            className={`desk-card ${
              runner.leadPhase === 'working' ? 'desk-card--working' : ''
            }`}
          >
            <div className="desk-card__top">
              <span className={dotClass(runner.leadPhase)} />
              <span className="desk-card__name">Design Lead</span>
              <span className="desk-card__phase">Direction</span>
            </div>
            <p className="desk-card__now">
              {runner.leadNow || 'Reads the brief, sets direction, dispatches the floor.'}
              {runner.leadPhase === 'working' && <span className="cursor" />}
            </p>
          </article>

          {DESKS.map((d) => {
            const st = runner.desks[d.id];
            return (
              <article
                className={`desk-card ${
                  st.phase === 'working'
                    ? 'desk-card--working'
                    : st.phase === 'done'
                      ? 'desk-card--done'
                      : ''
                }`}
                key={d.id}
              >
                <div className="desk-card__top">
                  <span className={dotClass(st.phase)} />
                  <span className="desk-card__name">{d.name}</span>
                  <span className="desk-card__phase">{PHASE_LABEL[st.phase]}</span>
                </div>
                <p className="desk-card__now">
                  {st.now || d.mandate.split(':')[0] + '.'}
                  {st.phase === 'working' && <span className="cursor" />}
                </p>
                {st.artifact && (
                  <div className="desk-card__artifact">
                    <div className="artifact__title">Delivered · {st.artifact.title}</div>
                    <p
                      className="artifact__body"
                      dangerouslySetInnerHTML={{ __html: st.artifact.body }}
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <aside className="log" aria-label="Activity log">
          <div className="log__head">
            <span>Activity</span>
            <span className="live">
              <span className="dot dot--done" /> {running ? 'live' : 'idle'}
            </span>
          </div>
          <div className="log__body" ref={logRef}>
            {runner.log.length === 0 ? (
              <p className="log__empty">
                Dispatch a brief to watch the Lead route work across the floor.
              </p>
            ) : (
              runner.log.map((l) => (
                <div
                  className={`log__line ${
                    l.who === 'lead'
                      ? 'log__line--lead'
                      : l.done
                        ? 'log__line--done'
                        : ''
                  }`}
                  key={l.key}
                >
                  <span className="log__t">{l.t}</span>
                  <span className="log__who">{WHO_LABEL[l.who]}</span>
                  <span className="log__msg">{l.msg}</span>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
