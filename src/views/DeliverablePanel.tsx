import { DESKS, type Deliverable, type DeskId } from '../lib/studio';

const DESK_NAME: Record<DeskId, string> = DESKS.reduce(
  (acc, d) => ({ ...acc, [d.id]: d.name }),
  {} as Record<DeskId, string>,
);

/**
 * The run's assembled result — what the closing log line has always
 * claimed but never produced. Rendered only once the run completes, so
 * it never shows a half-built deliverable.
 *
 * Section bodies are the same HTML the desk cards render, so the two
 * views can never disagree about what a desk delivered.
 */
export function DeliverablePanel({ deliverable }: { deliverable: Deliverable }) {
  return (
    <section className="deliverable" aria-label="Run deliverable">
      <header className="deliverable__head">
        <p className="deliverable__kicker">Deliverable · assembled for review</p>
        <h2 className="deliverable__headline">{deliverable.headline}</h2>
        <p className="deliverable__brief">
          <span className="deliverable__brief-label mono">Brief</span>
          {deliverable.brief}
        </p>
      </header>

      <div className="deliverable__sections">
        {deliverable.sections.map((s) => (
          <article className="deliverable__section" key={s.desk}>
            <div className="deliverable__section-top">
              <span className="deliverable__desk mono">{DESK_NAME[s.desk]}</span>
              <span className="deliverable__title">{s.title}</span>
            </div>
            <p
              className="deliverable__body"
              dangerouslySetInnerHTML={{ __html: s.body }}
            />
          </article>
        ))}
      </div>

      {deliverable.openQuestions.length > 0 && (
        <div className="deliverable__open">
          <p className="deliverable__open-label mono">Open questions</p>
          <ul className="deliverable__open-list">
            {deliverable.openQuestions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
