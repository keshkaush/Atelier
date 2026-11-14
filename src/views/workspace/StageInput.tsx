import { type ChangeEvent } from 'react';
import { SAMPLE_PROJECTS } from '../../lib/host';
import type { AttachedProject } from '../../lib/workspace/useWorkspace';
import { IconFolder, IconGitBranch, IconArrow } from '../../components/Icons';

/**
 * Stage 1 — the brief + project-directory attachment.
 * In mock mode "attach" is the sample-project picker; a real host
 * turns this same slot into a native folder picker with no UI rework.
 */
export function StageInput({
  brief,
  attached,
  onBrief,
  onAttach,
  onDetach,
  onAnalyze,
  busy,
}: {
  brief: string;
  attached?: AttachedProject;
  onBrief: (b: string) => void;
  onAttach: (id: string, label: string) => void;
  onDetach: () => void;
  onAnalyze: () => void;
  busy: boolean;
}) {
  const canAnalyze = brief.trim().length > 8 && !!attached && !busy;

  return (
    <div className="stage stage--input">
      <div className="stage__intro">
        <p className="stage__kicker">Step one — the brief</p>
        <h2 className="stage__title">
          Brief the studio on a <em>real</em> project.
        </h2>
        <p className="stage__lede">
          Describe the change, then attach the project directory it lives in. The
          studio reads the project and proposes a plan — it touches nothing until
          you approve.
        </p>
      </div>

      <div className="composer">
        <div className="composer__field">
          <label className="composer__label" htmlFor="ws-brief">
            What should change?
          </label>
          <textarea
            id="ws-brief"
            value={brief}
            spellCheck={false}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onBrief(e.target.value)}
            placeholder="e.g. Redesign the onboarding flow into a 3-step wizard, keeping the current dark theme."
            disabled={busy}
          />
        </div>
      </div>

      <div className="attach">
        <div className="attach__head">
          <span className="attach__label">
            <IconFolder size={15} /> Project directory
          </span>
          {attached && (
            <button className="btn btn--ghost btn--sm" type="button" onClick={onDetach}>
              Detach
            </button>
          )}
        </div>

        {attached ? (
          <div className="attach__current">
            <div className="attach__current-main">
              <span className="attach__name">{attached.label}</span>
              <span className="attach__path mono">/{attached.id}</span>
            </div>
            <span
              className={`attach__git ${attached.git.dirty ? 'is-dirty' : attached.git.isRepo ? 'is-clean' : 'is-none'}`}
            >
              <IconGitBranch size={13} />
              {attached.git.isRepo
                ? `${attached.git.branch ?? 'detached'} · ${attached.git.dirty ? 'uncommitted changes' : 'clean'}`
                : 'not a git repository'}
            </span>
          </div>
        ) : (
          <div className="attach__grid">
            {SAMPLE_PROJECTS.map((p) => (
              <button
                key={p.id}
                className="attach__card"
                type="button"
                onClick={() => onAttach(p.id, p.label)}
              >
                <span className="attach__card-name">{p.label}</span>
                <span className="attach__card-blurb">{p.blurb}</span>
                <span className="attach__card-git mono">
                  {p.git.isRepo ? `git · ${p.git.branch}${p.git.dirty ? ' · dirty' : ''}` : 'no git'}
                </span>
              </button>
            ))}
            <div className="attach__card attach__card--ghost" aria-disabled>
              <span className="attach__card-name">Choose a folder…</span>
              <span className="attach__card-blurb">
                Native folder picker — arrives with the local host adapter.
              </span>
              <span className="attach__card-git mono">milestone 2</span>
            </div>
          </div>
        )}
      </div>

      <div className="stage__actions">
        <span className="stage__hint">
          {!attached
            ? 'Attach a project to continue.'
            : brief.trim().length <= 8
              ? 'Write a few more words of brief.'
              : 'Ready — the studio will analyse before proposing.'}
        </span>
        <button
          className="btn btn--solid"
          type="button"
          disabled={!canAnalyze}
          onClick={onAnalyze}
        >
          Analyse project <IconArrow size={16} />
        </button>
      </div>
    </div>
  );
}
