export type Mode = 'console' | 'workspace';

/**
 * Segmented control switching the two peer modes in the shell.
 * The project-aware workspace is the home; the brief-driven Run
 * console is the alternate mode, listed second.
 */
export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Studio mode">
      <button
        className={`mode-switch__opt ${mode === 'workspace' ? 'is-on' : ''}`}
        role="tab"
        aria-selected={mode === 'workspace'}
        type="button"
        onClick={() => onChange('workspace')}
      >
        Project workspace
      </button>
      <button
        className={`mode-switch__opt ${mode === 'console' ? 'is-on' : ''}`}
        role="tab"
        aria-selected={mode === 'console'}
        type="button"
        onClick={() => onChange('console')}
      >
        Brief console
      </button>
    </div>
  );
}
