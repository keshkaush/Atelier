import { useState } from 'react';
import { RunConsole } from './views/RunConsole';
import { WorkspaceView } from './views/WorkspaceView';
import { FloorModal } from './views/FloorModal';
import { ModeSwitch, type Mode } from './components/ModeSwitch';
import { IconNetwork } from './components/Icons';

export function App() {
  const [mode, setMode] = useState<Mode>('workspace');
  const [floorOpen, setFloorOpen] = useState(false);

  return (
    <div className="shell">
      <div className="appbar">
        <div className="appbar__inner">
          <span className="appbar__brand mono">
            Atelier <em>studio os</em>
          </span>
          <ModeSwitch mode={mode} onChange={setMode} />
          {/* Console has its own floor button in the running head; expose one
              in the appbar only for the workspace so the floor stays reachable
              from both modes. */}
          {mode === 'workspace' && (
            <button
              className="btn btn--ghost btn--sm appbar__floor"
              type="button"
              onClick={() => setFloorOpen(true)}
            >
              <IconNetwork size={15} /> View the floor
            </button>
          )}
        </div>
      </div>
      <main className="page">
        {mode === 'console' ? (
          <RunConsole onOpenFloor={() => setFloorOpen(true)} />
        ) : (
          <WorkspaceView />
        )}
      </main>
      {floorOpen && <FloorModal onClose={() => setFloorOpen(false)} />}
    </div>
  );
}
