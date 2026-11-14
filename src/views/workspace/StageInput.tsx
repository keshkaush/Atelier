import { useState, type ChangeEvent, type FormEvent } from 'react';
import { SAMPLE_PROJECTS } from '../../lib/host';
import type { RootCandidate } from '../../lib/host/types';
import type { AttachedProject } from '../../lib/workspace/useWorkspace';
import { IconFolder, IconGitBranch, IconArrow, IconRestart } from '../../components/Icons';

/**
 * Stage 1 — the brief + project-directory attachment.
 *
 * Two host modes, one slot:
 *   · mock  — pick from the canned sample projects (offline demo).
 *   · local — pick one of the folders the sidecar was started with
 *             (ATELIER_ROOTS), or type an absolute path the sidecar will
 *             still validate against that allowlist. There is no arbitrary
 *             filesystem browse — the server only ever accepts declared roots.
 */
export function StageInput({
  brief,
  attached,
  hostKind,
  roots,
  onBrief,
  onAttach,
  onDetach,
  onAnalyze,
  onReloadRoots,
  busy,
  error,
}: {
  brief: string;
  attached?: AttachedProject;
  hostKind: 'mock' | 'local';
  roots: RootCandidate[];
  onBrief: (b: string) => void;
  onAttach: (id: string, label: string) => void;
  onDetach: () => void;
  onAnalyze: () => void;
  onReloadRoots: () => void;
  busy: boolean;
  error?: string;
}) {
  const [pathInput, setPathInput] = useState('');
  const canAnalyze = brief.trim().length > 8 && !!attached && !busy;
  const isLocal = hostKind === 'local';

  const attachFromPath = (e: FormEvent) => {
    e.preventDefault();
    const p = pathInput.trim();
    if (!p) return;
    const label = p.split(/[\\/]/).filter(Boolean).pop() ?? p;
    onAttach(p, label);
    setPathInput('');
  };

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
          <div className="attach__head-right">
            <span className={`attach__host attach__host--${hostKind}`}>
              {isLocal ? 'local host' : 'demo host'}
            </span>
            {attached && (
              <button className="btn btn--ghost btn--sm" type="button" onClick={onDetach}>
                Detach
              </button>
            )}
          </div>
        </div>

        {attached ? (
          <div className="attach__current">
            <div className="attach__current-main">
              <span className="attach__name">{attached.label}</span>
              <span className="attach__path mono">{attached.id}</span>
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
        ) : isLocal ? (
          /* --- local host: allowlisted roots + path entry ------------- */
          <div className="attach-local">
            {roots.length > 0 ? (
              <div className="attach__grid">
                {roots.map((r) => (
                  <button
                    key={r.path}
                    className="attach__card"
                    type="button"
                    onClick={() => onAttach(r.path, r.name)}
                  >
                    <span className="attach__card-name">{r.name}</span>
                    <span className="attach__card-blurb mono">{r.path}</span>
                    <span className="attach__card-git mono">allowlisted root · click to attach</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="attach__empty">
                <p>
                  The sidecar hasn’t been given any folders yet. Start it with{' '}
                  <span className="mono">ATELIER_ROOTS=&quot;/path/to/project&quot;</span>, or
                  re-check below.
                </p>
                <button
                  className="btn btn--ghost btn--sm"
                  type="button"
                  onClick={onReloadRoots}
                >
                  <IconRestart size={14} /> Re-check roots
                </button>
              </div>
            )}

            <form className="attach-path" onSubmit={attachFromPath}>
              <label className="attach-path__label mono" htmlFor="root-path">
                Or enter an absolute project path
              </label>
              <div className="attach-path__row">
                <input
                  id="root-path"
                  className="attach-path__input mono"
                  value={pathInput}
                  spellCheck={false}
                  placeholder="/Users/you/code/your-project"
                  onChange={(e) => setPathInput(e.target.value)}
                />
                <button
                  className="btn btn--solid btn--sm"
                  type="submit"
                  disabled={!pathInput.trim()}
                >
                  Attach
                </button>
              </div>
              <p className="attach-path__hint">
                The folder must be one the sidecar was started with. Anything else
                is refused — the host never reads outside its allowlist.
              </p>
            </form>
          </div>
        ) : (
          /* --- mock host: canned sample projects ---------------------- */
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
            <div className="attach__card attach__card--ghost">
              <span className="attach__card-name">Use a real folder</span>
              <span className="attach__card-blurb">
                Start the local host sidecar and set <span className="mono">VITE_HOST=local</span>{' '}
                to attach a real project directory.
              </span>
              <span className="attach__card-git mono">npm run host</span>
            </div>
          </div>
        )}

        {error && <div className="ws-error attach__error" role="alert">{error}</div>}
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
