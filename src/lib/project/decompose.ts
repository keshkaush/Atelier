/* ============================================================
   Semantic decomposition — brief + analysis → workstreams.

   Splits the brief into workstreams mapped onto the studio's own
   five desks (reusing DeskId from studio.ts so the feature speaks
   the studio's vocabulary rather than inventing a parallel one).

   Two splitters live here:

   · `decompose` — deterministic and rule-based. It reads the brief for
     intent signals and pairs them with the real paths the analysis
     found, so each stream's `touches` are grounded in the project. This
     is the fallback when no model is configured or the call fails.

   · `decomposeWithModel` — the model does the judgement part (reading
     the brief, deciding what each desk should do). It is never allowed
     to invent a path: `touches` is filtered against the real,
     non-ignored files in the listing.
   ============================================================ */

import { DESKS, LEAD, type DeskId } from '../studio';
import { ignoreReason, type ProjectAnalysis } from './analyze';
import type { DirEntry, DirListing } from '../host/types';
import { complete, type ModelConfig } from '../model';
import { isRecord, parseJsonReply, str, strArray } from './modelJson';

export type Risk = 'low' | 'med' | 'high';

export interface Workstream {
  id: string;
  desk: DeskId;
  title: string;
  scope: string;
  /** Real paths from the listing this stream is expected to affect. */
  touches: string[];
  risk: Risk;
}

/**
 * Pick up to `n` *included* paths matching a predicate, for grounding.
 * The ignore filter is not optional: a listing can contain vendored or
 * generated files (`.venv/…/style.css`), and a workstream that names one
 * would have the implementation stage read and diff it.
 */
function find(listing: DirListing, pred: (e: DirEntry) => boolean, n = 3): string[] {
  return listing.entries
    .filter((e) => e.kind === 'file' && !ignoreReason(e) && pred(e))
    .map((e) => e.path)
    .slice(0, n);
}

export function decompose(
  brief: string,
  analysis: ProjectAnalysis,
  listing: DirListing,
): Workstream[] {
  const b = brief.toLowerCase();
  const wants = (re: RegExp) => re.test(b);

  const componentPaths = find(listing, (e) => /\.(tsx|jsx|vue|svelte)$/.test(e.path), 3);
  const cssPaths = find(listing, (e) => /\.css$/.test(e.path), 3);
  const tokenPaths = analysis.tokens.files.slice(0, 3);
  const themePaths = find(listing, (e) => /theme/i.test(e.path), 3);
  const htmlPaths = find(listing, (e) => /\.html$/.test(e.path), 3);

  const streams: Workstream[] = [];

  // Always lead with research grounding.
  streams.push({
    id: 'ws-research',
    desk: 'research',
    title: 'Ground the direction',
    scope:
      'Scan comparable patterns for this kind of change and file an adopt / avoid / replicate memo the rest of the floor works from.',
    touches: [],
    risk: 'low',
  });

  // Structure — driven by whether there are components and whether the brief smells structural.
  streams.push({
    id: 'ws-ux',
    desk: 'ux',
    title: wants(/flow|step|onboard|navigation|architect|ia|structure/)
      ? 'Restructure the flow'
      : 'Shape the structure',
    scope:
      componentPaths.length > 0
        ? 'Define the information architecture and primary flow, then hand wireframe variants for the affected screens.'
        : 'Lay out the page structure and the navigation model, then hand wireframes for the affected views.',
    touches: componentPaths.length ? componentPaths : htmlPaths,
    risk: componentPaths.length > 3 ? 'med' : 'low',
  });

  // Surface — tokens / themes / styling.
  const surfaceRisk: Risk =
    tokenPaths.length && themePaths.length ? 'med' : cssPaths.length ? 'med' : 'low';
  streams.push({
    id: 'ws-ui',
    desk: 'ui',
    title: tokenPaths.length ? 'Extend the token system' : 'Define the surface',
    scope:
      tokenPaths.length > 0
        ? 'Map the change onto the existing token scale and theme layers, then specify component states so nothing is hard-coded.'
        : 'Establish the visual system for the change — colour, type, spacing, and interactive states — in the project’s styling approach.',
    touches: [...tokenPaths, ...themePaths, ...cssPaths].slice(0, 4),
    risk: surfaceRisk,
  });

  // Voice — copy always matters.
  streams.push({
    id: 'ws-content',
    desk: 'content',
    title: 'Write the interface copy',
    scope:
      'Write every string the change introduces, keep the terminology consistent with the existing product, and extend the style guide.',
    touches: [],
    risk: 'low',
  });

  // Ops — record + verify. Risk reflects dirty/large surface.
  const opsRisk: Risk = cssPaths.length + componentPaths.length > 5 ? 'med' : 'low';
  streams.push({
    id: 'ws-ops',
    desk: 'ops',
    title: 'Log decisions & verify',
    scope:
      'Record the decisions with rationale, capture the implementation impact, and prepare the QA / verification checklist for review.',
    touches: [],
    risk: opsRisk,
  });

  return streams;
}

/* ----------------------------------------------------------------
   Model-backed decomposition.

   The deterministic splitter above is the fallback and the shape
   contract. The model is asked to do the part that actually needs
   judgement — reading the brief and deciding what each desk should
   do — but it is never allowed to invent a path: `touches` is
   filtered against the real, non-ignored files in the listing, and
   anything else is dropped.
   ---------------------------------------------------------------- */

const DESK_IDS: DeskId[] = ['research', 'ux', 'ui', 'content', 'ops'];
const RISKS: Risk[] = ['low', 'med', 'high'];

/** Every real, non-ignored file path the model may name. */
export function candidatePaths(listing: DirListing, limit = 400): string[] {
  return listing.entries
    .filter((e) => e.kind === 'file' && !ignoreReason(e))
    .map((e) => e.path)
    .slice(0, limit);
}

function validateWorkstreams(v: unknown, allowed: Set<string>): Workstream[] {
  if (!isRecord(v) || !Array.isArray(v.workstreams)) {
    throw new Error('Expected { "workstreams": [...] }.');
  }
  const out: Workstream[] = [];
  for (const raw of v.workstreams) {
    if (!isRecord(raw)) continue;
    const desk = str(raw.desk, 20) as DeskId | null;
    if (!desk || !DESK_IDS.includes(desk)) continue;
    const title = str(raw.title, 120);
    const scope = str(raw.scope, 600);
    if (!title || !scope) continue;
    const risk = (str(raw.risk, 10) ?? 'low') as Risk;
    const touches = (strArray(raw.touches, 6, 300) ?? []).filter((p) => allowed.has(p));
    out.push({
      id: `ws-${desk}`,
      desk,
      title,
      scope,
      touches,
      risk: RISKS.includes(risk) ? risk : 'low',
    });
  }
  // One stream per desk, in the studio's own order — the UI assumes it.
  const byDesk = new Map(out.map((w) => [w.desk, w]));
  const ordered = DESK_IDS.map((d) => byDesk.get(d)).filter((w): w is Workstream => Boolean(w));
  if (ordered.length < 3) throw new Error('The model returned too few usable workstreams.');
  return ordered;
}

/**
 * Ask the model to split the brief across the five desks. Throws on any
 * unusable reply; the caller falls back to `decompose()`.
 */
export async function decomposeWithModel(
  cfg: ModelConfig,
  brief: string,
  analysis: ProjectAnalysis,
  listing: DirListing,
  signal?: AbortSignal,
): Promise<Workstream[]> {
  const allowed = candidatePaths(listing);
  const allowedSet = new Set(allowed);

  const system = [
    'You are the Design Lead of a five-desk design studio.',
    LEAD.mandate,
    '',
    'The desks and their mandates:',
    ...DESKS.map((d) => `- ${d.id} (${d.name}): ${d.mandate}`),
    '',
    'Split the user’s brief into exactly one workstream per desk. Ground each',
    'workstream in the real files it will touch. Reply with JSON only:',
    '{ "workstreams": [ { "desk": "research|ux|ui|content|ops",',
    '  "title": "short imperative title", "scope": "one or two sentences",',
    '  "touches": ["path", ...], "risk": "low|med|high" } ] }',
    '',
    'Rules:',
    '- `touches` may ONLY contain paths from the supplied file list. Never invent one.',
    '- A desk with no file-level work gets an empty `touches` array.',
    '- Titles and scopes must be specific to THIS brief, not generic.',
  ].join('\n');

  const user = [
    `BRIEF:\n${brief.trim()}`,
    '',
    `PROJECT: ${analysis.summary}`,
    `Framework: ${analysis.framework.map((f) => f.name).join(', ') || 'none detected'}`,
    `Styling: ${analysis.styling.map((s) => s.name).join(', ') || 'none detected'}`,
    `Themes: ${analysis.themes.map((t) => t.name).join(', ') || 'single theme'}`,
    `Token sources: ${analysis.tokens.files.join(', ') || 'none'}`,
    '',
    `FILES IN SCOPE (${allowed.length}):`,
    allowed.join('\n'),
  ].join('\n');

  const reply = await complete(
    cfg,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.2, signal },
  );

  return parseJsonReply(reply, (v) => validateWorkstreams(v, allowedSet));
}
