/* ============================================================
   Design proposal — the high-level artifact the studio returns
   before anything is built, versioned, and decided on.

   A proposal is immutable. Revise and "alternative" each produce a
   NEW proposal with a bumped version and a changeNote, so the
   version rail is an honest history. Approve is the only decision
   that can lead toward implementation — and in Milestone 1 it lands
   on a holding state; nothing here writes a file.

   preview blocks are schematic wireframe primitives, not pixels —
   drawn by ProposalPreview in the studio's hairline idiom.
   ============================================================ */

import type { ProjectAnalysis } from './analyze';
import type { Workstream } from './decompose';
import { complete, type ModelConfig } from '../model';
import { isRecord, parseJsonReply, str, strArray } from './modelJson';

export type PreviewBlock =
  | { kind: 'heading'; text: string; level: 1 | 2 }
  | { kind: 'text'; lines: number }
  | { kind: 'row'; blocks: PreviewBlock[]; ratio?: number[] }
  | { kind: 'box'; label: string; h?: number }
  | { kind: 'split'; left: PreviewBlock[]; right: PreviewBlock[] }
  | { kind: 'list'; items: number };

export interface Alternative {
  id: string;
  label: string;
  tradeoff: string;
}

export interface DesignProposal {
  version: number;
  createdAt: number;
  /** "Requirement understanding" — the brief, restated and checkable. */
  requirement: { text: string; confidence: 'high' | 'med' | 'low' }[];
  design: { headline: string; body: string; structure: string[] };
  preview: PreviewBlock[];
  impact: {
    files: string[];
    adds: number;
    edits: number;
    removes: number;
    notes: string[];
  };
  workstreams: Workstream[];
  alternatives?: Alternative[];
  /** What changed vs the previous version; absent on v1. */
  changeNote?: string;
}

export type Decision =
  | { kind: 'approve' }
  | { kind: 'revise'; instruction: string }
  | { kind: 'alternative'; id: string }
  | { kind: 'cancel' };

/* ---------------------------------------------------------------- */

/** First version of a proposal from the brief + analysis + workstreams. */
export function buildProposal(
  brief: string,
  analysis: ProjectAnalysis,
  workstreams: Workstream[],
): DesignProposal {
  const b = brief.trim();
  const lower = b.toLowerCase();

  const touches = Array.from(new Set(workstreams.flatMap((w) => w.touches)));
  const edits = touches.length;
  const adds = workstreams.filter((w) => w.desk === 'ux' || w.desk === 'ui').length + 2;
  const removes = /remove|delete|replace|simplif|consolidat/.test(lower) ? 1 : 0;

  const themesLine = analysis.themes.length
    ? `respects the ${analysis.themes.map((t) => t.name.toLowerCase()).join(', ')} theme${analysis.themes.length === 1 ? '' : 's'}`
    : 'works in the project’s existing single theme';

  const tokenLine = analysis.tokens.files.length
    ? `builds on ${analysis.tokens.files.length} token source${analysis.tokens.files.length === 1 ? '' : 's'}`
    : 'introduces a light token layer so values stop being hard-coded';

  return {
    version: 1,
    createdAt: Date.now(),
    requirement: deriveRequirement(b, analysis),
    design: {
      headline: headlineFor(lower, analysis),
      body: `The change is scoped to the surfaces the brief names and ${tokenLine}. It ${themesLine}. Every workstream stays inside the files it touches, so the blast radius is legible before a single line moves.`,
      structure: [
        ...workstreams
          .filter((w) => w.desk !== 'ops')
          .map((w) => `${w.title} — ${w.desk}`),
        'Log decisions, capture impact, prepare QA',
      ],
    },
    preview: previewFor(lower, analysis),
    impact: {
      files: touches,
      adds,
      edits,
      removes,
      notes: [
        'No files are modified by this proposal.',
        analysis.components.count
          ? `${analysis.components.count} existing components in scope for reuse.`
          : 'No component layer yet — the surface is plain markup and CSS.',
      ],
    },
    workstreams,
    alternatives: alternativesFor(analysis),
  };
}

/* ----------------------------------------------------------------
   Model-backed proposal.

   The model writes the parts that are actually prose — the requirement
   reading, the design headline and body, the structure list, the impact
   notes. Everything structural stays local: the preview wireframe is
   derived from the brief by `previewFor`, the file list comes from the
   workstreams, and the counts are computed here. A model cannot widen
   the blast radius by claiming more files than the plan touches.
   ---------------------------------------------------------------- */

function validateProposal(
  v: unknown,
): {
  requirement: { text: string; confidence: 'high' | 'med' | 'low' }[];
  design: { headline: string; body: string; structure: string[] };
  notes: string[];
} {
  if (!isRecord(v)) throw new Error('Expected a JSON object.');
  const design = v.design;
  if (!isRecord(design)) throw new Error('Missing "design".');
  const headline = str(design.headline, 160);
  const body = str(design.body, 1200);
  const structure = strArray(design.structure, 10, 200);
  if (!headline || !body || !structure || structure.length === 0) {
    throw new Error('"design" needs a headline, a body and a structure list.');
  }

  if (!Array.isArray(v.requirement)) throw new Error('Missing "requirement".');
  const requirement: { text: string; confidence: 'high' | 'med' | 'low' }[] = [];
  for (const raw of v.requirement) {
    if (!isRecord(raw)) continue;
    const text = str(raw.text, 400);
    if (!text) continue;
    const c = str(raw.confidence, 10);
    requirement.push({
      text,
      confidence: c === 'high' || c === 'med' || c === 'low' ? c : 'med',
    });
  }
  if (requirement.length === 0) throw new Error('"requirement" was empty.');

  return {
    requirement,
    design: { headline, body, structure },
    notes: strArray(v.notes, 6, 300) ?? [],
  };
}

/**
 * Ask the model for the proposal prose. Throws on an unusable reply; the
 * caller falls back to `buildProposal()`.
 */
export async function buildProposalWithModel(
  cfg: ModelConfig,
  brief: string,
  analysis: ProjectAnalysis,
  workstreams: Workstream[],
  signal?: AbortSignal,
): Promise<DesignProposal> {
  const base = buildProposal(brief, analysis, workstreams);

  const system = [
    'You are the Design Lead of a five-desk design studio, writing the',
    'high-level design proposal a client will approve or revise.',
    'Reply with JSON only:',
    '{ "requirement": [ { "text": "...", "confidence": "high|med|low" } ],',
    '  "design": { "headline": "...", "body": "...", "structure": ["..."] },',
    '  "notes": ["..."] }',
    '',
    'Rules:',
    '- `requirement` restates what the brief actually asks for, as checkable claims.',
    '- `design.headline` is one short line; `design.body` is two or three sentences.',
    '- `design.structure` lists the work in order, one line per step.',
    '- `notes` are honest caveats about impact. Do not claim files are modified.',
    '- Be specific to THIS brief and THIS project. No generic filler.',
  ].join('\n');

  const user = [
    `BRIEF:\n${brief.trim()}`,
    '',
    `PROJECT: ${analysis.summary}`,
    `Framework: ${analysis.framework.map((f) => f.name).join(', ') || 'none detected'}`,
    `Styling: ${analysis.styling.map((s) => s.name).join(', ') || 'none detected'}`,
    `Themes: ${analysis.themes.map((t) => t.name).join(', ') || 'single theme'}`,
    `Token sources: ${analysis.tokens.files.join(', ') || 'none'}`,
    `Components: ${analysis.components.count}`,
    '',
    'WORKSTREAMS:',
    ...workstreams.map(
      (w) => `- ${w.desk}: ${w.title} — ${w.scope} (touches: ${w.touches.join(', ') || 'none'})`,
    ),
  ].join('\n');

  const reply = await complete(
    cfg,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.3, signal },
  );

  const parsed = parseJsonReply(reply, validateProposal);

  return {
    ...base,
    requirement: parsed.requirement,
    design: parsed.design,
    impact: {
      ...base.impact,
      notes: parsed.notes.length ? parsed.notes : base.impact.notes,
    },
  };
}

function deriveRequirement(
  brief: string,
  analysis: ProjectAnalysis,
): { text: string; confidence: 'high' | 'med' | 'low' }[] {
  const lower = brief.toLowerCase();
  const req: { text: string; confidence: 'high' | 'med' | 'low' }[] = [];

  req.push({ text: `Deliver: “${brief.length > 140 ? brief.slice(0, 137) + '…' : brief}”`, confidence: 'high' });

  if (analysis.framework.length) {
    req.push({ text: `Work within ${analysis.summary}.`, confidence: 'high' });
  }
  if (analysis.themes.length) {
    req.push({
      text: `Honour the existing ${analysis.themes.map((t) => t.name.toLowerCase()).join(' / ')} theme${analysis.themes.length === 1 ? '' : 's'}.`,
      confidence: 'med',
    });
  }
  const structural = /flow|step|onboard|navigation|page|screen|layout|architect/.test(lower);
  req.push({
    text: structural
      ? 'Restructure at the flow / layout level, not just restyle.'
      : 'Change the surface treatment while preserving the current structure.',
    confidence: structural ? 'med' : 'low',
  });
  if (!analysis.tokens.files.length) {
    req.push({
      text: 'No token system present — decide whether to introduce one.',
      confidence: 'low',
    });
  }
  return req;
}

function headlineFor(lower: string, analysis: ProjectAnalysis): string {
  if (/onboard|sign\s?-?up|first.?run/.test(lower)) return 'A guided first run';
  if (/pricing|tier|plan/.test(lower)) return 'A pricing surface that scales';
  if (/empty|error|no.?results/.test(lower)) return 'States that guide, not scold';
  if (/dashboard|board|kanban/.test(lower)) return 'A board that reads at a glance';
  if (/theme|dark mode/.test(lower)) return 'One system, every theme';
  return `A considered change to the ${analysis.styling[0]?.name ?? analysis.framework[0]?.name ?? 'project'} surface`;
}

function previewFor(lower: string, analysis: ProjectAnalysis): PreviewBlock[] {
  // A schematic top-of-screen wireframe, varied by intent.
  const hasSidebar = /dashboard|board|sidebar|nav/.test(lower) || analysis.components.count > 6;
  const listy = /list|feed|table|results|inbox/.test(lower);

  const main: PreviewBlock[] = [
    { kind: 'heading', text: 'Screen title', level: 1 },
    { kind: 'text', lines: 2 },
    listy
      ? { kind: 'list', items: 4 }
      : { kind: 'row', blocks: [ { kind: 'box', label: 'Card', h: 2 }, { kind: 'box', label: 'Card', h: 2 }, { kind: 'box', label: 'Card', h: 2 } ] },
    { kind: 'box', label: 'Primary action', h: 1 },
  ];

  if (hasSidebar) {
    return [
      {
        kind: 'split',
        left: [ { kind: 'box', label: 'Nav', h: 6 }, { kind: 'text', lines: 2 } ],
        right: main,
      },
    ];
  }
  return [{ kind: 'box', label: 'Top bar', h: 1 }, ...main];
}

function alternativesFor(analysis: ProjectAnalysis): Alternative[] {
  const base: Alternative[] = [
    {
      id: 'minimal',
      label: 'Minimal diff',
      tradeoff: 'Smallest change to the current structure — fastest to review, least visual movement.',
    },
    {
      id: 'ambitious',
      label: 'Ambitious rebuild',
      tradeoff: 'Reworks the surrounding structure for a stronger result — more files, longer review.',
    },
  ];
  if (analysis.tokens.files.length === 0) {
    base.push({
      id: 'tokenize',
      label: 'Introduce tokens first',
      tradeoff: 'Adds a token layer before the visual change — more upfront work, cleaner long term.',
    });
  }
  return base;
}

/* ----------------------------------------------------------------
   Revise / alternative — each returns a fresh proposal, bumped.
   ---------------------------------------------------------------- */

export function revise(prev: DesignProposal, instruction: string): DesignProposal {
  const note = instruction.trim() || 'Revised the proposal.';
  return {
    ...prev,
    version: prev.version + 1,
    createdAt: Date.now(),
    changeNote: `Revision — ${note}`,
    requirement: [
      { text: `Revision requested: “${note}”`, confidence: 'high' },
      ...prev.requirement.slice(0, 3),
    ],
    impact: {
      ...prev.impact,
      notes: ['Revised in place — no files modified.', ...prev.impact.notes.slice(0, 1)],
    },
  };
}

export function chooseAlternative(prev: DesignProposal, alt: Alternative): DesignProposal {
  const bumpAdds = alt.id === 'ambitious' ? 3 : alt.id === 'tokenize' ? 2 : 0;
  return {
    ...prev,
    version: prev.version + 1,
    createdAt: Date.now(),
    changeNote: `Alternative — ${alt.label}: ${alt.tradeoff}`,
    design: {
      ...prev.design,
      headline: `${prev.design.headline} · ${alt.label}`,
      body: `${prev.design.body} Taking the “${alt.label}” path: ${alt.tradeoff}`,
    },
    impact: {
      ...prev.impact,
      adds: prev.impact.adds + bumpAdds,
      notes: [`Alternative path: ${alt.label}.`, 'No files modified.'],
    },
    // keep the alternatives list so the user can switch again
  };
}
