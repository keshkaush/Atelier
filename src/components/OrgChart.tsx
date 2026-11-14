import { DESKS, LEAD } from '../lib/studio';

/**
 * The studio org chart — the hero. A schematic drawn with hairlines:
 * a user request feeds the Design Lead, who rides a bus across the
 * five specialist desks. Echoes the reference diagram, restated in
 * the studio's editorial type.
 */
export function OrgChart() {
  return (
    <section className="chart" aria-label="Studio org chart">
      <div className="chart__caption">
        <h2>The floor</h2>
        <p>One brief in. Five desks out. Every run starts at the Lead.</p>
      </div>

      <div className="tier tier--lead">
        <div className="node node--request">
          <span className="node__name">User Request</span>
        </div>
      </div>

      <div className="spine" aria-hidden />

      <div className="tier tier--lead">
        <div className="node node--lead">
          <div className="node__role">
            <span className="dot dot--working" />
            {LEAD.role}
          </div>
          <span className="node__name">{LEAD.name}</span>
          <p className="node__desc">{LEAD.mandate}</p>
          <div className="node__skills">
            {LEAD.skills.map((s) => (
              <span className="node__chip" key={s}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="spine" aria-hidden />

      <div className="bus-wrap">
        <div className="bus" aria-hidden>
          <span className="bus__label">Delegates work and reviews outputs</span>
        </div>
      </div>

      <div className="tier tier--desks">
        {DESKS.map((d) => (
          <div className="node" key={d.id}>
            <div className="node__role">
              <span className="dot dot--queued" />
              {d.role}
            </div>
            <span className="node__name">{d.name}</span>
            <p className="node__desc">{d.mandate}</p>
            <div className="node__skills">
              {d.skills.slice(0, 3).map((s) => (
                <span className="node__chip" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
