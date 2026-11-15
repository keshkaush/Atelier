/* ============================================================
   Semantic decomposition — brief + analysis → workstreams.

   Splits the brief into workstreams mapped onto the studio's own
   five desks (reusing DeskId from studio.ts so the feature speaks
   the studio's vocabulary rather than inventing a parallel one).

   Milestone 1 is a deterministic, rule-based splitter: it reads the
   brief for intent signals and pairs them with the real paths the
   analysis found, so each stream's `touches` are grounded in the
   project. It is a clean seam to swap for a model.ts call — see
   the README note — but defaults offline & instant.
   ============================================================ */

import type { DeskId } from '../studio';
import type { ProjectAnalysis } from './analyze';
import type { DirListing } from '../host/types';

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

/** Pick up to `n` included paths matching a predicate, for grounding. */
function find(listing: DirListing, pred: (p: string) => boolean, n = 3): string[] {
  return listing.entries
    .filter((e) => e.kind === 'file' && pred(e.path))
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

  const componentPaths = find(listing, (p) => /\.(tsx|jsx|vue|svelte)$/.test(p), 3);
  const cssPaths = find(listing, (p) => /\.css$/.test(p), 3);
  const tokenPaths = analysis.tokens.files.slice(0, 3);
  const themePaths = find(listing, (p) => /theme/i.test(p), 3);
  const htmlPaths = find(listing, (p) => /\.html$/.test(p), 3);

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
