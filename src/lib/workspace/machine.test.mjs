/* ============================================================
   Reducer transition tests for the full workspace machine (stages 1–9).

   The reducer is pure TS with only type-imports (erased), so we compile
   machine.ts to plain ESM and drive it directly — no React, no jsdom.
   Run:  node --test src/lib/workspace/machine.test.mjs
   (The `tsc:test` script compiles to a temp dir first; see package.json.)
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  workspaceReducer,
  initialState,
  isBusy,
  latestVersion,
  displayedProposal,
  canAdvanceBranchPrep,
  isValidBranchName,
  acceptedDiffs,
  hasDiskWrites,
  qaVerdict,
} from './machine.js';

const run = (s, ...actions) => actions.reduce(workspaceReducer, s);

const listing = { root: 'demo', entries: [] };
const analysis = { framework: [], styling: [], components: { count: 0, samples: [] }, tokens: { files: [], signals: [] }, themes: [], ignored: { count: 0, reasons: {} }, summary: '', scanned: 0, dirs: 0, total: 0, truncated: false };
const workstreams = [];
const proposal = {
  version: 1,
  createdAt: 0,
  requirement: [],
  design: { headline: 'h', body: 'b', structure: [] },
  preview: [],
  impact: { files: [], adds: 0, edits: 0, removes: 0, notes: [] },
  workstreams: [],
};

const attached = (dirty = false) => ({
  type: 'ATTACH',
  project: { id: 'demo', label: 'Demo', git: { isRepo: true, branch: 'main', dirty } },
});

/** Drive to a given stage from scratch. */
function toApproved() {
  return run(
    initialState,
    attached(),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams },
    { type: 'PROPOSAL_BUILT', proposal },
    { type: 'APPROVE' },
  );
}

const plan = {
  diffs: [
    { path: 'src/App.tsx', status: 'modified', hunks: [], adds: 2, dels: 0 },
    { path: 'src/index.css', status: 'modified', hunks: [], adds: 1, dels: 1 },
    { path: 'src/unchanged.ts', status: 'unchanged', hunks: [], adds: 0, dels: 0 },
  ],
  // Complete write payloads for the changed files; never derived from hunks.
  edits: [
    { path: 'src/App.tsx', original: 'old app\n', content: 'new app\n' },
    { path: 'src/index.css', original: 'old css\n', content: 'new css\n' },
  ],
  skipped: [],
  totals: { files: 2, adds: 3, dels: 1 },
  generatedAt: 1,
};

const report = {
  ranAt: 1,
  isNodeProject: true,
  packageManager: 'npm',
  steps: {
    typecheck: { status: 'pass' },
    lint: { status: 'skipped' },
    test: { status: 'pass' },
  },
};

/* ---------------------------------------------------------- */
/* stages 1–5 (regression)                                     */
/* ---------------------------------------------------------- */

test('happy path through approval', () => {
  let s = toApproved();
  assert.equal(s.stage, 'approved');
  assert.equal(latestVersion(s), 1);
});

test('illegal events are ignored, not thrown (guarded)', () => {
  let s = initialState;
  s = run(s, { type: 'BEGIN_ANALYSIS' }); // no attach
  assert.equal(s.stage, 'input');
  s = toApproved();
  s = run(s, { type: 'BEGIN_DECOMPOSE' }); // wrong stage
  assert.equal(s.stage, 'approved');
});

test('ATTACH_FAIL records an error on input; a later attach clears it', () => {
  let s = run(initialState, { type: 'ATTACH_FAIL', error: 'outside allowlist' });
  assert.equal(s.stage, 'input');
  assert.equal(s.error, 'outside allowlist');
  // A successful attach resets (initialState spread) and clears the error.
  s = run(s, attached());
  assert.equal(s.error, undefined);
  assert.ok(s.attached);
});

test('ATTACH_FAIL is ignored outside the input stage', () => {
  let s = toApproved();
  s = run(s, { type: 'ATTACH_FAIL', error: 'nope' });
  assert.equal(s.stage, 'approved');
  assert.equal(s.error, undefined);
});

/* ---------------------------------------------------------- */
/* stage 6 — branch prep                                       */
/* ---------------------------------------------------------- */

test('OPEN_BRANCH_PREP only from approved; seeds skip default', () => {
  let s = run(initialState, { type: 'OPEN_BRANCH_PREP' });
  assert.equal(s.stage, 'input', 'ignored before approved');

  s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' });
  assert.equal(s.stage, 'branch-prep');
  assert.equal(s.branch?.mode, 'skip');
  assert.equal(s.branch?.currentBranch, 'main');
});

test('BRANCH_PREP_OK advances to final-approve carrying the choice', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' });
  s = run(s, { type: 'BRANCH_PREP_OK', choice: { mode: 'create', name: 'feat/x', created: 'feat/x' } });
  assert.equal(s.stage, 'final-approve');
  assert.equal(s.branch?.name, 'feat/x');
});

test('canAdvanceBranchPrep: skip is allowed on clean; dirty needs ack', () => {
  let clean = toApproved();
  clean = run(clean, { type: 'OPEN_BRANCH_PREP' });
  assert.equal(canAdvanceBranchPrep(clean), true, 'clean skip ok');

  let dirty = run(
    initialState,
    attached(true),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams },
    { type: 'PROPOSAL_BUILT', proposal },
    { type: 'APPROVE' },
    { type: 'OPEN_BRANCH_PREP' },
  );
  assert.equal(canAdvanceBranchPrep(dirty), false, 'dirty skip blocked until ack');
  dirty = run(dirty, { type: 'SET_BRANCH_CHOICE', choice: { mode: 'skip', dirtyAcknowledged: true } });
  assert.equal(canAdvanceBranchPrep(dirty), true, 'dirty skip ok after ack');
});

test('canAdvanceBranchPrep: create needs a valid name', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' });
  s = run(s, { type: 'SET_BRANCH_CHOICE', choice: { mode: 'create', name: '' } });
  assert.equal(canAdvanceBranchPrep(s), false, 'empty name blocked');
  s = run(s, { type: 'SET_BRANCH_CHOICE', choice: { mode: 'create', name: '../evil' } });
  assert.equal(canAdvanceBranchPrep(s), false, 'invalid name blocked');
  s = run(s, { type: 'SET_BRANCH_CHOICE', choice: { mode: 'create', name: 'feat/good' } });
  assert.equal(canAdvanceBranchPrep(s), true, 'valid name ok');
});

test('isValidBranchName matches the server rules', () => {
  for (const ok of ['feat/onboarding', 'fix-123', 'a.b/c_d']) assert.equal(isValidBranchName(ok), true, ok);
  for (const bad of ['', '-x', '../evil', 'has space', 'a//b', 'trail/', 'x.']) assert.equal(isValidBranchName(bad), false, bad);
});

test('BRANCH_FAIL stays on branch-prep and records the note', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' });
  s = run(s, { type: 'BRANCH_FAIL', error: 'dirty tree' });
  assert.equal(s.stage, 'branch-prep');
  assert.equal(s.error, 'dirty tree');
  // A subsequent successful OK clears the error.
  s = run(s, { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } });
  assert.equal(s.error, undefined);
});

test('REFRESH_GIT updates attached git + currentBranch without moving stage', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' });
  s = run(s, { type: 'REFRESH_GIT', git: { isRepo: true, branch: 'feat/live', dirty: true } });
  assert.equal(s.stage, 'branch-prep');
  assert.equal(s.attached?.git.dirty, true);
  assert.equal(s.branch?.currentBranch, 'feat/live');
});

test('BACK_TO_PROPOSAL clears branch + downstream from the gate', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' }, { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } });
  assert.equal(s.stage, 'final-approve');
  s = run(s, { type: 'BACK_TO_PROPOSAL' });
  assert.equal(s.stage, 'proposal');
  assert.equal(s.branch, undefined);
});

/* ---------------------------------------------------------- */
/* stage 7 — final approval → implement                        */
/* ---------------------------------------------------------- */

test('BEGIN_IMPLEMENT only from final-approve; records approval time', () => {
  let s = toApproved();
  s = run(s, { type: 'BEGIN_IMPLEMENT', finalApprovedAt: 123 }); // wrong stage
  assert.equal(s.stage, 'approved');

  s = run(s, { type: 'OPEN_BRANCH_PREP' }, { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } });
  s = run(s, { type: 'BEGIN_IMPLEMENT', finalApprovedAt: 123 });
  assert.equal(s.stage, 'implementing');
  assert.equal(s.finalApprovedAt, 123);
  assert.equal(isBusy(s), true, 'implementing is busy');
});

test('BACK_TO_BRANCH_PREP returns from the gate', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' }, { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } });
  s = run(s, { type: 'BACK_TO_BRANCH_PREP' });
  assert.equal(s.stage, 'branch-prep');
});

/* ---------------------------------------------------------- */
/* stage 8 — implementation (dry-run) + review                 */
/* ---------------------------------------------------------- */

function toReview(dirty = false) {
  let s = dirty
    ? run(
        initialState,
        attached(true),
        { type: 'BEGIN_ANALYSIS' },
        { type: 'ANALYSIS_OK', listing, analysis },
        { type: 'BEGIN_DECOMPOSE' },
        { type: 'DECOMPOSE_OK', workstreams },
        { type: 'PROPOSAL_BUILT', proposal },
        { type: 'APPROVE' },
      )
    : toApproved();
  s = run(
    s,
    { type: 'OPEN_BRANCH_PREP' },
    { type: 'BRANCH_PREP_OK', choice: { mode: 'skip', dirtyAcknowledged: dirty } },
    { type: 'BEGIN_IMPLEMENT', finalApprovedAt: 1 },
    { type: 'IMPLEMENT_OK', plan },
  );
  return s;
}

test('IMPLEMENT_OK lands on review and accepts changed files by default', () => {
  const s = toReview();
  assert.equal(s.stage, 'review');
  assert.deepEqual(Object.keys(s.reviewDecisions).sort(), ['src/App.tsx', 'src/index.css']);
  // unchanged files are not in the decision map
  assert.equal(s.reviewDecisions['src/unchanged.ts'], undefined);
});

test('acceptedDiffs reflects per-file decisions', () => {
  let s = toReview();
  assert.equal(acceptedDiffs(s).length, 2);
  s = run(s, { type: 'SET_REVIEW_DECISION', path: 'src/index.css', decision: 'skip' });
  assert.equal(acceptedDiffs(s).length, 1);
  assert.equal(acceptedDiffs(s)[0].path, 'src/App.tsx');
});

test('IMPLEMENT_FAIL returns to the final-approve gate with an error', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_BRANCH_PREP' }, { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } });
  s = run(s, { type: 'BEGIN_IMPLEMENT', finalApprovedAt: 1 });
  s = run(s, { type: 'IMPLEMENT_FAIL', error: 'read failed' });
  assert.equal(s.stage, 'final-approve');
  assert.equal(s.error, 'read failed');
});

/* ---------------------------------------------------------- */
/* model fallback notes                                        */
/* ---------------------------------------------------------- */

test('a fallback note rides through decompose → proposal → implement', () => {
  const note = 'Model request failed (429).';
  let s = run(
    initialState,
    attached(),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams, note },
  );
  assert.equal(s.stage, 'decomposed');
  assert.equal(s.modelNote, note, 'decompose note is kept for the UI');

  s = run(s, { type: 'PROPOSAL_BUILT', proposal, note: 'No model key configured.' });
  assert.equal(s.stage, 'proposal');
  assert.equal(s.modelNote, 'No model key configured.', 'the latest stage wins');

  s = run(
    s,
    { type: 'APPROVE' },
    { type: 'OPEN_BRANCH_PREP' },
    { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } },
    { type: 'BEGIN_IMPLEMENT', finalApprovedAt: 1 },
    { type: 'IMPLEMENT_OK', plan, note: 'Model returned no usable edits.' },
  );
  assert.equal(s.stage, 'review');
  assert.equal(s.modelNote, 'Model returned no usable edits.');
});

test('a clean model run leaves no fallback note', () => {
  let s = run(
    initialState,
    attached(),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams },
    { type: 'PROPOSAL_BUILT', proposal },
  );
  assert.equal(s.modelNote, undefined);
  s = run(
    s,
    { type: 'APPROVE' },
    { type: 'OPEN_BRANCH_PREP' },
    { type: 'BRANCH_PREP_OK', choice: { mode: 'skip' } },
    { type: 'BEGIN_IMPLEMENT', finalApprovedAt: 1 },
    { type: 'IMPLEMENT_OK', plan },
  );
  assert.equal(s.modelNote, undefined);
});

test('the note never leaks onto a stage that has no output for it', () => {
  // A stale note from decomposition must not survive a step back.
  let s = run(
    initialState,
    attached(),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams, note: 'old note' },
  );
  assert.equal(s.modelNote, 'old note');
  s = run(s, { type: 'BACK_TO_ANALYZED' });
  assert.equal(s.stage, 'analyzed');
  assert.equal(s.modelNote, undefined);
});

test('re-running a stage clears the previous note before the new one lands', () => {
  let s = run(
    initialState,
    attached(),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams, note: 'first attempt failed' },
    { type: 'BACK_TO_ANALYZED' },
    { type: 'BEGIN_DECOMPOSE' },
  );
  assert.equal(s.stage, 'decomposing');
  assert.equal(s.modelNote, undefined, 'cleared while the retry is in flight');
  s = run(s, { type: 'DECOMPOSE_OK', workstreams });
  assert.equal(s.modelNote, undefined);
});

test('PROPOSAL_FAIL surfaces the error and stays on decomposed', () => {
  let s = run(
    initialState,
    attached(),
    { type: 'BEGIN_ANALYSIS' },
    { type: 'ANALYSIS_OK', listing, analysis },
    { type: 'BEGIN_DECOMPOSE' },
    { type: 'DECOMPOSE_OK', workstreams },
    { type: 'PROPOSAL_FAIL', error: 'builder threw' },
  );
  assert.equal(s.stage, 'decomposed', 'the user can retry the step');
  assert.equal(s.error, 'builder threw');
  assert.equal(s.modelNote, undefined);

  // Ignored once the proposal actually exists.
  let p = run(s, { type: 'PROPOSAL_BUILT', proposal });
  p = run(p, { type: 'PROPOSAL_FAIL', error: 'late' });
  assert.equal(p.stage, 'proposal');
  assert.equal(p.error, undefined);
});

/* ---------------------------------------------------------- */
/* stage 8b — write-on-confirm                                 */
/* ---------------------------------------------------------- */

const applied = (paths) => ({
  status: 'applied',
  applied: paths,
  issues: [],
  note: `Wrote ${paths.length} files.`,
});

/** Review → frozen confirmation gate (the default: everything accepted). */
function toApplyConfirm() {
  return run(toReview(), { type: 'OPEN_APPLY_CONFIRM' });
}

test('OPEN_APPLY_CONFIRM requires review + a plan', () => {
  let s = toApproved();
  s = run(s, { type: 'OPEN_APPLY_CONFIRM' });
  assert.equal(s.stage, 'approved', 'ignored before review');

  s = toApplyConfirm();
  assert.equal(s.stage, 'apply-confirm');
});

test('OPEN_APPLY_CONFIRM freezes only the accepted edits', () => {
  let s = run(toReview(), { type: 'SET_REVIEW_DECISION', path: 'src/index.css', decision: 'skip' });
  s = run(s, { type: 'OPEN_APPLY_CONFIRM' });
  assert.deepEqual(s.pendingEdits.map((e) => e.path), ['src/App.tsx']);

  // Review decisions can no longer change what the frozen batch contains.
  s = run(s, { type: 'SET_REVIEW_DECISION', path: 'src/index.css', decision: 'accept' });
  assert.deepEqual(s.pendingEdits.map((e) => e.path), ['src/App.tsx']);
  assert.equal(s.pendingEdits[0].original, 'old app\n');
  assert.equal(s.pendingEdits[0].content, 'new app\n');
});

test('OPEN_APPLY_CONFIRM with nothing accepted freezes an empty batch', () => {
  const s = run(toReview(), { type: 'SET_REVIEW_DECISIONS', decisions: {} }, { type: 'OPEN_APPLY_CONFIRM' });
  assert.equal(s.stage, 'apply-confirm');
  assert.deepEqual(s.pendingEdits, []);
});

test('BACK_TO_REVIEW_FROM_APPLY unfreezes the batch', () => {
  let s = toApplyConfirm();
  s = run(s, { type: 'BACK_TO_REVIEW_FROM_APPLY' });
  assert.equal(s.stage, 'review');
  assert.equal(s.pendingEdits, undefined, 'unfrozen');
  assert.equal(s.applyResult, undefined);
});

test('BEGIN_APPLY needs the gate and a non-empty batch', () => {
  let s = toReview();
  s = run(s, { type: 'BEGIN_APPLY' });
  assert.equal(s.stage, 'review', 'not at the gate → ignored');

  s = run(s, { type: 'SET_REVIEW_DECISIONS', decisions: {} }, { type: 'OPEN_APPLY_CONFIRM' });
  s = run(s, { type: 'BEGIN_APPLY' });
  assert.equal(s.stage, 'apply-confirm', 'empty batch → ignored');

  s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  assert.equal(s.stage, 'applying');
  assert.equal(isBusy(s), true, 'applying is busy');
});

test('APPLY_SUCCEEDED moves applying → qa and records the result', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  const result = applied(['src/App.tsx', 'src/index.css']);
  s = run(s, { type: 'APPLY_SUCCEEDED', result });
  assert.equal(s.stage, 'qa');
  assert.deepEqual(s.applyResult, result);
  assert.equal(hasDiskWrites(s.applyResult), true);
});

test('APPLY_SUCCEEDED ignores a non-success result (never QA on a failure)', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  const partial = { status: 'partial', applied: ['src/App.tsx'], issues: [{ path: 'src/index.css', reason: 'x' }] };
  s = run(s, { type: 'APPLY_SUCCEEDED', result: partial });
  assert.equal(s.stage, 'applying', 'stays; the failure path handles this');
  assert.equal(s.applyResult, undefined);
});

test('APPLY_SUCCEEDED accepts a simulated write but hasDiskWrites is false', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  const sim = { status: 'simulated', applied: [], issues: [], note: 'dry run' };
  s = run(s, { type: 'APPLY_SUCCEEDED', result: sim });
  assert.equal(s.stage, 'qa');
  assert.equal(hasDiskWrites(s.applyResult), false);
});

test('APPLY_FAILED returns to the gate with the exact outcome, never to QA', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  const conflict = {
    status: 'conflict',
    applied: [],
    issues: [{ path: 'src/App.tsx', reason: 'The file changed on disk.' }],
    note: 'Nothing was written.',
  };
  s = run(s, { type: 'APPLY_FAILED', result: conflict });
  assert.equal(s.stage, 'apply-confirm');
  assert.equal(s.error, undefined);
  assert.deepEqual(s.applyResult, conflict);
  // The frozen batch is still there so the user can re-review or go back.
  assert.equal(s.pendingEdits.length, 2);
  assert.equal(hasDiskWrites(s.applyResult), false);
});

test('APPLY_FAILED carries a transport error alongside the result', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  s = run(s, {
    type: 'APPLY_FAILED',
    result: { status: 'failed', applied: [], issues: [] },
    error: 'sidecar unreachable',
  });
  assert.equal(s.stage, 'apply-confirm');
  assert.equal(s.error, 'sidecar unreachable');
});

test('SKIP_APPLY goes to QA from review or the gate without a result', () => {
  let s = run(toReview(), { type: 'SKIP_APPLY' });
  assert.equal(s.stage, 'qa');
  assert.equal(s.applyResult, undefined);

  s = run(toApplyConfirm(), { type: 'SKIP_APPLY' });
  assert.equal(s.stage, 'qa');
  assert.equal(s.pendingEdits, undefined, 'nothing kept that could be applied later');

  // Not valid from anywhere else.
  s = run(toApproved(), { type: 'SKIP_APPLY' });
  assert.equal(s.stage, 'approved');
});

test('hasDiskWrites survives a partial batch and clears on back', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  const partial = { status: 'partial', applied: ['src/App.tsx'], issues: [{ path: 'src/index.css', reason: 'x' }] };
  s = run(s, { type: 'APPLY_FAILED', result: partial });
  assert.equal(hasDiskWrites(s.applyResult), true, 'partial really wrote a file');
  s = run(s, { type: 'BACK_TO_REVIEW' }); // no-op at the gate
  assert.equal(s.stage, 'apply-confirm');
  s = run(s, { type: 'BACK_TO_REVIEW_FROM_APPLY' });
  assert.equal(s.applyResult, undefined, 'stale outcome cleared');
});

/* ---------------------------------------------------------- */
/* stage 9 — QA                                                */
/* ---------------------------------------------------------- */

test('QA_REPORT completes; verdict derives from steps', () => {
  let s = run(toReview(), { type: 'SKIP_APPLY' }, { type: 'QA_REPORT', report });
  assert.equal(s.stage, 'complete');
  assert.equal(qaVerdict(s), 'pass');

  const failing = { ...report, steps: { ...report.steps, test: { status: 'fail' } } };
  const s2 = run(toReview(), { type: 'SKIP_APPLY' }, { type: 'QA_REPORT', report: failing });
  assert.equal(qaVerdict(s2), 'fail');

  const unavailable = {
    ...report,
    steps: { typecheck: { status: 'unavailable' }, lint: { status: 'skipped' }, test: { status: 'skipped' } },
  };
  const s3 = run(toReview(), { type: 'SKIP_APPLY' }, { type: 'QA_REPORT', report: unavailable });
  assert.equal(qaVerdict(s3), 'unavailable');
});

test('QA_REPORT is ignored outside the qa stage', () => {
  const s = run(toReview(), { type: 'QA_REPORT', report });
  assert.equal(s.stage, 'review');
});

test('QA_FAIL returns to review with an error', () => {
  let s = run(toReview(), { type: 'SKIP_APPLY' });
  s = run(s, { type: 'QA_FAIL', error: 'verify crashed' });
  assert.equal(s.stage, 'review');
  assert.equal(s.error, 'verify crashed');
});

test('BACK_TO_REVIEW from QA clears the apply outcome', () => {
  let s = run(toApplyConfirm(), { type: 'BEGIN_APPLY' });
  s = run(s, { type: 'APPLY_SUCCEEDED', result: applied(['src/App.tsx', 'src/index.css']) });
  s = run(s, { type: 'BACK_TO_REVIEW' });
  assert.equal(s.stage, 'review');
  assert.equal(s.applyResult, undefined);
  assert.equal(s.pendingEdits, undefined);
});

/* ---------------------------------------------------------- */
/* resets clear stages 6–9                                     */
/* ---------------------------------------------------------- */

test('RESET fully clears everything including stage 6–9 state', () => {
  const s = run(toReview(), { type: 'RESET' });
  assert.equal(s.stage, 'input');
  assert.equal(s.branch, undefined);
  assert.equal(s.plan, undefined);
  assert.deepEqual(s.reviewDecisions, {});
});

test('BACK_TO_INPUT from a late stage clears downstream but keeps attach', () => {
  let s = toReview();
  s = run(s, { type: 'BACK_TO_INPUT' });
  assert.equal(s.stage, 'input');
  assert.ok(s.attached, 'keeps attach');
  assert.equal(s.plan, undefined);
  assert.deepEqual(s.reviewDecisions, {});
});

test('reducer never mutates prior state', () => {
  const s = toReview();
  const before = JSON.stringify(s);
  run(s, { type: 'SET_BRIEF', brief: 'zzz' });
  assert.equal(JSON.stringify(s), before);
});
