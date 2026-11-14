import type { AttachedProject, QaVerdict } from '../../lib/workspace/useWorkspace';
import type { ImplementationPlanState } from '../../lib/workspace/useWorkspace';
import type { VerifyReport, VerifyStep, StepStatus } from '../../lib/host/types';
import type { DesignProposal } from '../../lib/project/proposal';
import { IconCheck, IconClose, IconRestart, IconSpark } from '../../components/Icons';

const STATUS_LABEL: Record<StepStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  skipped: 'Skipped',
  unavailable: 'Unavailable',
  error: 'Error',
};

const STATUS_DOT: Record<StepStatus, string> = {
  pass: 'dot dot--done',
  fail: 'dot dot--warn',
  skipped: 'dot dot--queued',
  unavailable: 'dot dot--queued',
  error: 'dot dot--warn',
};

const VERDICT_COPY: Record<QaVerdict, { title: string; body: string; seal: 'ok' | 'warn' | 'muted' }> = {
  pass: {
    title: 'Verification passed',
    body: 'Every check the project declares ran green. The plan is sound to apply in your editor.',
    seal: 'ok',
  },
  fail: {
    title: 'Verification found problems',
    body: 'At least one check failed. Review the output below before applying anything.',
    seal: 'warn',
  },
  unavailable: {
    title: 'Checks could not run here',
    body: 'The target didn’t expose a runnable typecheck/lint/test on this platform. Nothing failed — the tooling just wasn’t available.',
    seal: 'muted',
  },
};

function StepRow({ label, step }: { label: string; step: VerifyStep }) {
  return (
    <div className="qa-step">
      <span className={STATUS_DOT[step.status]} />
      <span className="qa-step__name">{label}</span>
      <span className={`qa-step__status qa-step__status--${step.status}`}>
        {STATUS_LABEL[step.status]}
      </span>
      {step.elapsedMs != null && (
        <span className="qa-step__time mono">{(step.elapsedMs / 1000).toFixed(1)}s</span>
      )}
      {step.note && <span className="qa-step__note">{step.note}</span>}
      {step.output && step.status !== 'pass' && (
        <pre className="qa-step__output mono">{step.output}</pre>
      )}
    </div>
  );
}

/**
 * Stage 9 — QA / verification report. While the host runs (stage 'qa'),
 * shows the in-flight state; once the report lands ('complete') shows the
 * verdict + per-step results. Status colour only, editorial styling.
 */
export function StageQA({
  stage,
  qa,
  verdict,
  plan,
  proposal,
  attached,
  acceptedCount,
  onBack,
  onReset,
}: {
  stage: 'qa' | 'complete';
  qa?: VerifyReport;
  verdict: QaVerdict;
  plan?: ImplementationPlanState;
  proposal?: DesignProposal;
  attached?: AttachedProject;
  acceptedCount: number;
  onBack: () => void;
  onReset: () => void;
}) {
  const running = stage === 'qa' || !qa;
  const copy = VERDICT_COPY[verdict];
  const stamp = qa ? new Date(qa.ranAt).toLocaleString() : '';

  if (running) {
    return (
      <div className="stage stage--qa">
        <div className="stage__intro">
          <p className="stage__kicker">Step nine — verification</p>
          <h2 className="stage__title">
            Running the project’s <em>own</em> checks.
          </h2>
          <p className="stage__lede">
            Typecheck always; lint and tests if the project declares them. This reads
            and builds — it writes nothing.
          </p>
        </div>
        <div className="qa-running">
          <span className="dot dot--working" />
          <span>Verifying {attached?.label ?? 'the project'}…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="stage stage--qa stage--complete">
      <div className="stage__intro">
        <p className="stage__kicker">Step nine — verification</p>
        <h2 className="stage__title">
          The run is <em>complete</em>.
        </h2>
        <p className="stage__lede">
          The plan was approved, drafted as a reviewable dry-run diff, and checked
          against the project’s own tooling. Nothing was written to your files.
        </p>
      </div>

      <div className={`qa-verdict qa-verdict--${copy.seal}`}>
        <span className={`qa-verdict__seal qa-verdict__seal--${copy.seal}`}>
          {copy.seal === 'ok' ? <IconCheck size={22} /> : <IconSpark size={20} />}
        </span>
        <div className="qa-verdict__text">
          <h3 className="qa-verdict__title">{copy.title}</h3>
          <p className="qa-verdict__body">{copy.body}</p>
        </div>
      </div>

      <div className="qa-grid">
        <div className="qa-panel">
          <div className="qa-panel__head">
            <span>Checks</span>
            <span className="mono">{qa.packageManager ?? '—'}</span>
          </div>
          <div className="qa-steps">
            <StepRow label="Typecheck" step={qa.steps.typecheck} />
            <StepRow label="Lint" step={qa.steps.lint} />
            <StepRow label="Tests" step={qa.steps.test} />
          </div>
        </div>

        <div className="qa-panel">
          <div className="qa-panel__head">
            <span>Change summary</span>
          </div>
          <div className="qa-summary">
            <div className="qa-summary__row">
              <span className="qa-summary__k">Proposal</span>
              <span className="qa-summary__v">v{proposal?.version ?? '—'}</span>
            </div>
            <div className="qa-summary__row">
              <span className="qa-summary__k">Files in plan</span>
              <span className="qa-summary__v">{acceptedCount}</span>
            </div>
            <div className="qa-summary__row">
              <span className="qa-summary__k">Diff size</span>
              <span className="qa-summary__v">
                {plan ? `+${plan.totals.adds} · −${plan.totals.dels}` : '—'}
              </span>
            </div>
            <div className="qa-summary__row">
              <span className="qa-summary__k">Writes</span>
              <span className="qa-summary__v qa-summary__v--safe">None — dry run</span>
            </div>
            <div className="qa-summary__row">
              <span className="qa-summary__k">Verified</span>
              <span className="qa-summary__v mono">{stamp}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="qa-reassure">
        <IconCheck size={14} />
        <span>
          Application is yours: copy a diff into your editor when you’re ready.
          Write-on-confirm is a later milestone — this run changed nothing.
        </span>
      </div>

      <div className="stage__actions">
        <button className="btn btn--ghost" type="button" onClick={onBack}>
          <IconRestart size={15} /> Back to review
        </button>
        <button className="btn btn--solid" type="button" onClick={onReset}>
          <IconClose size={15} /> Start another brief
        </button>
      </div>
    </div>
  );
}
