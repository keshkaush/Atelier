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
        {/* Triptych: switch left, wordmark dead-centre, floor right. Equal
            side columns keep the wordmark on the bar's true centre, not on the
            centre of whatever space the switch left over. */}
        <div className="appbar__inner">
          <ModeSwitch mode={mode} onChange={setMode} />
          <span className="appbar__brand mono">
            Atelier <em>— an agentic design studio</em>
          </span>
          {/* One floor entry for both modes — the console no longer carries
              its own running head. */}
          <button
            className="btn btn--ghost btn--sm appbar__floor"
            type="button"
            aria-label="View the floor"
            onClick={() => setFloorOpen(true)}
          >
            <IconNetwork size={15} />
            <span className="appbar__floor-label">View the floor</span>
          </button>
        </div>
      </div>
      <main className="page">
        {mode === 'console' ? (
          <RunConsole />
        ) : (
          <WorkspaceView />
        )}
      </main>
      {floorOpen && <FloorModal onClose={() => setFloorOpen(false)} />}
    </div>
  );
}
