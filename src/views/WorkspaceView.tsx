import { useWorkspace } from '../lib/workspace/useWorkspace';
import { StageInput } from './workspace/StageInput';
import { StageAnalyze } from './workspace/StageAnalyze';
import { StageDecompose } from './workspace/StageDecompose';
import { StageProposal } from './workspace/StageProposal';
import { StageApproved } from './workspace/StageApproved';

const STEPS = [
  { key: 'input', label: 'Brief' },
  { key: 'analyze', label: 'Analyse' },
  { key: 'decompose', label: 'Decompose' },
  { key: 'proposal', label: 'Propose' },
  { key: 'approved', label: 'Approve' },
] as const;

/** Map the hook's fine-grained stage onto the five tracker steps. */
function stepIndex(stage: string): number {
  switch (stage) {
    case 'input':
    case 'analyzing':
      return 0;
    case 'analyzed':
      return 1;
    case 'decomposing':
    case 'decomposed':
      return 2;
    case 'proposal':
      return 3;
    case 'approved':
      return 4;
    default:
      return 0;
  }
}

export function WorkspaceView() {
  const ws = useWorkspace();
  const active = stepIndex(ws.stage);

  return (
    <div className="wrap">
      <header className="masthead">
        <div>
          <p className="masthead__kicker">Project-aware studio</p>
          <h1 className="masthead__title">
            Read the project. <em>Propose</em> the change. Then build.
          </h1>
        </div>
        <div className="masthead__meta">
          <strong>Analysis first</strong>
          nothing written
          <br />
          until you approve
          <br />
          branch prep · next
        </div>
      </header>

      <nav className="stepper" aria-label="Progress">
        {STEPS.map((s, i) => {
          const state = i < active ? 'is-done' : i === active ? 'is-active' : 'is-todo';
          return (
            <div className={`stepper__step ${state}`} key={s.key}>
              <span className="stepper__idx mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="stepper__label">{s.label}</span>
            </div>
          );
        })}
      </nav>

      {ws.error && <div className="ws-error" role="alert">{ws.error}</div>}

      {ws.stage === 'input' || ws.stage === 'analyzing' ? (
        <StageInput
          brief={ws.brief}
          attached={ws.attached}
          onBrief={ws.setBrief}
          onAttach={ws.attach}
          onDetach={ws.detach}
          onAnalyze={ws.runAnalysis}
          busy={ws.busy}
        />
      ) : null}

      {ws.stage === 'analyzed' && ws.listing && ws.analysis ? (
        <StageAnalyze
          listing={ws.listing}
          analysis={ws.analysis}
          onBack={ws.backToInput}
          onNext={ws.runDecompose}
        />
      ) : null}

      {(ws.stage === 'decomposing' || ws.stage === 'decomposed') ? (
        <StageDecompose
          workstreams={ws.workstreams}
          busy={ws.busy}
          onBack={ws.backToAnalyzed}
          onNext={ws.runProposal}
        />
      ) : null}

      {ws.stage === 'proposal' && ws.proposal ? (
        <StageProposal
          proposal={ws.proposal}
          versions={ws.versions}
          current={ws.currentVersion}
          viewingVersion={ws.viewingVersion}
          onView={ws.viewVersion}
          onDecide={ws.decide}
        />
      ) : null}

      {ws.stage === 'approved' && ws.proposal ? (
        <StageApproved proposal={ws.proposal} onReset={ws.reset} />
      ) : null}
    </div>
  );
}
