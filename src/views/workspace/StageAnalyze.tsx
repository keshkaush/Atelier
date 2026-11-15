import { FileTree } from '../../components/FileTree';
import type { DirListing } from '../../lib/host/types';
import type { ProjectAnalysis, Detected } from '../../lib/project/analyze';
import { IconArrow, IconRestart } from '../../components/Icons';

const CONF: Record<Detected['confidence'], string> = {
  high: 'conf--high',
  med: 'conf--med',
  low: 'conf--low',
};

function StackRow({
  title,
  items,
  empty,
}: {
  title: string;
  items: Detected[];
  empty: string;
}) {
  return (
    <div className="detect__row">
      <span className="detect__k">{title}</span>
      <div className="detect__v">
        {items.length === 0 ? (
          <span className="detect__empty">{empty}</span>
        ) : (
          items.map((d) => (
            <span className={`detect__item ${CONF[d.confidence]}`} key={d.name}>
              <span className="detect__name">{d.name}</span>
              <span className="detect__ev mono">{d.evidence[0]}</span>
              {d.evidence.length > 1 && (
                <span className="detect__evmore">+{d.evidence.length - 1}</span>
              )}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function StageAnalyze({
  listing,
  analysis,
  onBack,
  onNext,
}: {
  listing: DirListing;
  analysis: ProjectAnalysis;
  onBack: () => void;
  onNext: () => void;
}) {
  const ignoreReasons = Object.entries(analysis.ignored.reasons).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="stage stage--analyze">
      <div className="stage__intro">
        <p className="stage__kicker">Step two — analysis</p>
        <h2 className="stage__title">
          Here’s what the studio <em>reads</em>.
        </h2>
        <p className="stage__lede">
          Structural detection only — frameworks, styling, components, tokens and
          themes, each claim backed by the files that prove it. Dependencies, build
          output, lockfiles and secrets are never crawled.
        </p>
      </div>

      <div className="runbar runbar--detect" aria-label="Analysis summary">
        <div className="runbar__seg">
          <span className="runbar__k">Stack</span>
          <span className="runbar__v runbar__v--sm">{analysis.summary}</span>
        </div>
        <div className="runbar__seg">
          <span className="runbar__k">Files analysed</span>
          <span className="runbar__v">{analysis.scanned}</span>
        </div>
        <div className="runbar__seg">
          <span className="runbar__k">Components</span>
          <span className="runbar__v">{analysis.components.count}</span>
        </div>
        <div className="runbar__seg">
          <span className="runbar__k">Ignored</span>
          <span className="runbar__v">{analysis.ignored.count}</span>
        </div>
      </div>

      <div className="analyze">
        <div className="analyze__tree">
          <div className="analyze__tree-head">
            <span>{listing.root}</span>
            <span className="mono">{listing.entries.length} entries</span>
          </div>
          <FileTree entries={listing.entries} />
        </div>

        <div className="analyze__detect">
          <div className="detect">
            <StackRow title="Framework" items={analysis.framework} empty="No framework — static markup." />
            <StackRow title="Styling" items={analysis.styling} empty="No stylesheets detected." />
            <div className="detect__row">
              <span className="detect__k">Components</span>
              <div className="detect__v">
                {analysis.components.count === 0 ? (
                  <span className="detect__empty">No component layer.</span>
                ) : (
                  <>
                    <span className="detect__item conf--high">
                      <span className="detect__name">{analysis.components.count} found</span>
                    </span>
                    {analysis.components.samples.slice(0, 4).map((s) => (
                      <span className="detect__chip mono" key={s}>
                        {s}
                      </span>
                    ))}
                  </>
                )}
              </div>
            </div>
            <div className="detect__row">
              <span className="detect__k">Tokens</span>
              <div className="detect__v">
                {analysis.tokens.files.length === 0 ? (
                  <span className="detect__empty">No token layer.</span>
                ) : (
                  analysis.tokens.files.map((f) => (
                    <span className="detect__chip mono" key={f}>
                      {f}
                    </span>
                  ))
                )}
              </div>
            </div>
            <StackRow title="Themes" items={analysis.themes} empty="Single theme." />
          </div>

          <div className="ignored">
            <div className="ignored__head">
              <span>Not crawled</span>
              <span className="mono">{analysis.ignored.count} entries skipped</span>
            </div>
            {ignoreReasons.length === 0 ? (
              <p className="ignored__none">Nothing needed skipping in this listing.</p>
            ) : (
              <ul className="ignored__list">
                {ignoreReasons.map(([reason, n]) => (
                  <li className="ignored__item" key={reason}>
                    <span className="ignored__reason">{reason}</span>
                    <span className="ignored__count mono">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="stage__actions">
        <button className="btn btn--ghost" type="button" onClick={onBack}>
          <IconRestart size={15} /> Back to brief
        </button>
        <button className="btn btn--solid" type="button" onClick={onNext}>
          Decompose the work <IconArrow size={16} />
        </button>
      </div>
    </div>
  );
}
