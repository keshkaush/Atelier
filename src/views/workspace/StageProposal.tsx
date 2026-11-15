import { useEffect, useReducer, type ChangeEvent } from 'react';
import type { DesignProposal, Decision } from '../../lib/project/proposal';
import { ProposalPreview } from './ProposalPreview';
import { VersionRail } from './VersionRail';
import { IconCheck, IconSpark, IconArrow, IconClose } from '../../components/Icons';

const CONF: Record<'high' | 'med' | 'low', string> = {
  high: 'conf--high',
  med: 'conf--med',
  low: 'conf--low',
};

/* ----------------------------------------------------------------
   The decision bar is its own little machine. Three mutually
   exclusive modes — you are either at rest, weighing alternatives,
   or writing a revision. A union (not two booleans) makes the
   illegal "revising AND showing alternatives" state unrepresentable.
   ---------------------------------------------------------------- */

type DecisionUI =
  | { mode: 'idle' }
  | { mode: 'alternatives' }
  | { mode: 'revising'; text: string };

type DecisionUIAction =
  | { type: 'TOGGLE_ALTERNATIVES' }
  | { type: 'START_REVISE' }
  | { type: 'EDIT_REVISE'; text: string }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

const decisionUIInit: DecisionUI = { mode: 'idle' };

function decisionUIReducer(s: DecisionUI, a: DecisionUIAction): DecisionUI {
  switch (a.type) {
    case 'TOGGLE_ALTERNATIVES':
      return s.mode === 'alternatives' ? { mode: 'idle' } : { mode: 'alternatives' };
    case 'START_REVISE':
      return { mode: 'revising', text: s.mode === 'revising' ? s.text : '' };
    case 'EDIT_REVISE':
      return s.mode === 'revising' ? { mode: 'revising', text: a.text } : s;
    case 'CANCEL':
    case 'RESET':
      return { mode: 'idle' };
    default:
      return s;
  }
}

/**
 * The high-level design proposal — the artifact the whole journey
 * builds to. Requirement understanding → proposed design → schematic
 * preview → implementation impact → decision bar, with the version
 * rail alongside. Nothing here writes; approve lands on a holding card.
 */
export function StageProposal({
  proposal,
  versions,
  current,
  viewingVersion,
  onView,
  onDecide,
}: {
  proposal: DesignProposal;
  versions: DesignProposal[];
  current: number;
  viewingVersion: number | null;
  onView: (v: number) => void;
  onDecide: (d: Decision) => void;
}) {
  const [ui, dispatchUI] = useReducer(decisionUIReducer, decisionUIInit);

  // A new proposal version (revise / alternative) or switching which
  // version we're viewing always drops back to the rest state — you
  // should never land on a new version mid-edit.
  useEffect(() => {
    dispatchUI({ type: 'RESET' });
  }, [proposal.version, viewingVersion]);

  const isPastVersion = proposal.version !== current;

  return (
    <div className="stage stage--proposal">
      <div className="stage__intro">
        <p className="stage__kicker">
          Step four — proposal ·{' '}
          <span className="mono">
            v{proposal.version}
            {isPastVersion ? ' (viewing)' : ''}
          </span>
        </p>
        <h2 className="stage__title">
          A high-level design, <em>before</em> anything moves.
        </h2>
        <p className="stage__lede">
          Read the plan. Approve it, revise it, weigh an alternative, or cancel.
          No file is touched until you approve.
        </p>
      </div>

      <div className="proposal">
        <div className="proposal__main">
          {/* 1 — requirement understanding */}
          <section className="psection" aria-label="Requirement understanding">
            <div className="psection__head">
              <span className="psection__no">01</span>
              <h3>Requirement understanding</h3>
            </div>
            <ul className="req">
              {proposal.requirement.map((r, i) => (
                <li className="req__item" key={i}>
                  <span className={`conf-dot ${CONF[r.confidence]}`} aria-hidden />
                  <span className="req__text">{r.text}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 2 — proposed design */}
          <section className="psection" aria-label="Proposed design">
            <div className="psection__head">
              <span className="psection__no">02</span>
              <h3>Proposed design</h3>
            </div>
            <p className="design__headline">{proposal.design.headline}</p>
            <p className="design__body">{proposal.design.body}</p>
            <ol className="design__structure">
              {proposal.design.structure.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </section>

          {/* 3 — visual preview */}
          <section className="psection" aria-label="Visual preview">
            <div className="psection__head">
              <span className="psection__no">03</span>
              <h3>Visual preview</h3>
              <span className="note">schematic — layout intent, not pixels</span>
            </div>
            <ProposalPreview blocks={proposal.preview} />
          </section>

          {/* 4 — implementation impact */}
          <section className="psection" aria-label="Implementation impact">
            <div className="psection__head">
              <span className="psection__no">04</span>
              <h3>Implementation impact</h3>
            </div>
            <div className="impact">
              <div className="impact__counts">
                <div className="impact__count">
                  <span className="impact__num">+{proposal.impact.adds}</span>
                  <span className="impact__lab">additions</span>
                </div>
                <div className="impact__count">
                  <span className="impact__num">~{proposal.impact.edits}</span>
                  <span className="impact__lab">edits</span>
                </div>
                <div className="impact__count">
                  <span className="impact__num">−{proposal.impact.removes}</span>
                  <span className="impact__lab">removals</span>
                </div>
              </div>
              {proposal.impact.files.length > 0 && (
                <div className="impact__files">
                  {proposal.impact.files.map((f) => (
                    <span className="impact__file mono" key={f}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <ul className="impact__notes">
                {proposal.impact.notes.map((n, i) => (
                  <li key={i} className={i === 0 ? 'impact__note impact__note--safe' : 'impact__note'}>
                    {i === 0 && <IconCheck size={13} />} {n}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* version rail */}
        <VersionRail
          versions={versions}
          current={current}
          viewingVersion={viewingVersion}
          onView={onView}
        />
      </div>

      {/* decision bar */}
      {isPastVersion ? (
        <div className="stage__actions stage__actions--pinned">
          <span className="stage__hint">You’re viewing v{proposal.version}. Return to the latest to decide.</span>
          <button className="btn btn--solid" type="button" onClick={() => onView(current)}>
            Back to latest <IconArrow size={16} />
          </button>
        </div>
      ) : (
        <div className="decision" aria-label="Proposal decision">
          {ui.mode === 'revising' ? (
            <div className="decision__revise">
              <label className="decision__revise-label" htmlFor="revise">
                What should change?
              </label>
              <textarea
                id="revise"
                value={ui.text}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  dispatchUI({ type: 'EDIT_REVISE', text: e.target.value })
                }
                placeholder="e.g. Keep the current nav; only rework the pricing cards."
                rows={2}
              />
              <div className="decision__revise-actions">
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={() => dispatchUI({ type: 'CANCEL' })}
                >
                  Cancel
                </button>
                <button
                  className="btn btn--solid btn--sm"
                  type="button"
                  disabled={ui.text.trim().length < 3}
                  onClick={() => onDecide({ kind: 'revise', instruction: ui.text })}
                >
                  Create revision
                </button>
              </div>
            </div>
          ) : (
            <>
              {ui.mode === 'alternatives' && proposal.alternatives && (
                <div className="decision__alts">
                  {proposal.alternatives.map((alt) => (
                    <button
                      key={alt.id}
                      className="alt"
                      type="button"
                      onClick={() => onDecide({ kind: 'alternative', id: alt.id })}
                    >
                      <span className="alt__label">{alt.label}</span>
                      <span className="alt__tradeoff">{alt.tradeoff}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="decision__bar">
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => onDecide({ kind: 'cancel' })}
                >
                  <IconClose size={15} /> Cancel
                </button>
                <div className="decision__right">
                  {proposal.alternatives && proposal.alternatives.length > 0 && (
                    <button
                      className="btn btn--ghost"
                      type="button"
                      onClick={() => dispatchUI({ type: 'TOGGLE_ALTERNATIVES' })}
                    >
                      <IconSpark size={15} /> Alternatives
                    </button>
                  )}
                  <button
                    className="btn"
                    type="button"
                    onClick={() => dispatchUI({ type: 'START_REVISE' })}
                  >
                    Revise
                  </button>
                  <button
                    className="btn btn--solid"
                    type="button"
                    onClick={() => onDecide({ kind: 'approve' })}
                  >
                    <IconCheck size={16} /> Approve
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
