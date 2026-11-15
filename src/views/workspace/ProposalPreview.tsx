import type { PreviewBlock } from '../../lib/project/proposal';

/**
 * Draws the proposal's schematic wireframe — hairline boxes, not pixels.
 * Deliberately abstract: it communicates layout intent, which is honest
 * about what a *high-level* proposal can promise.
 */
function Block({ b }: { b: PreviewBlock }) {
  switch (b.kind) {
    case 'heading':
      return (
        <div className={`pv__heading ${b.level === 1 ? 'pv__heading--1' : 'pv__heading--2'}`}>
          {b.text}
        </div>
      );
    case 'text':
      return (
        <div className="pv__text">
          {Array.from({ length: b.lines }).map((_, i) => (
            <span
              key={i}
              className="pv__line"
              style={{ width: i === b.lines - 1 ? '62%' : '100%' }}
            />
          ))}
        </div>
      );
    case 'list':
      return (
        <div className="pv__list">
          {Array.from({ length: b.items }).map((_, i) => (
            <span key={i} className="pv__listitem" />
          ))}
        </div>
      );
    case 'row':
      return (
        <div className="pv__row">
          {b.blocks.map((child, i) => (
            <div
              key={i}
              className="pv__col"
              style={{ flex: b.ratio?.[i] ?? 1 }}
            >
              <Block b={child} />
            </div>
          ))}
        </div>
      );
    case 'split':
      return (
        <div className="pv__split">
          <div className="pv__split-col pv__split-col--side">
            {b.left.map((child, i) => (
              <Block key={i} b={child} />
            ))}
          </div>
          <div className="pv__split-col">
            {b.right.map((child, i) => (
              <Block key={i} b={child} />
            ))}
          </div>
        </div>
      );
    case 'box':
      return (
        <div className="pv__box" style={{ minHeight: `${(b.h ?? 2) * 0.72}rem` }}>
          <span className="pv__box-label">{b.label}</span>
        </div>
      );
  }
}

export function ProposalPreview({ blocks }: { blocks: PreviewBlock[] }) {
  return (
    <div className="pv" aria-label="Wireframe preview">
      <div className="pv__chrome" aria-hidden>
        <span className="pv__dot" />
        <span className="pv__dot" />
        <span className="pv__dot" />
        <span className="pv__chrome-label">preview · schematic</span>
      </div>
      <div className="pv__canvas">
        {blocks.map((b, i) => (
          <Block key={i} b={b} />
        ))}
      </div>
    </div>
  );
}
