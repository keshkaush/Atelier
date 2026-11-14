/* ============================================================
   The studio roster + run model.
   Roster is derived directly from the org chart: a Design Lead
   who delegates a brief across five specialist desks.
   ============================================================ */

export type DeskId = 'research' | 'ux' | 'ui' | 'content' | 'ops';

export type Phase = 'queued' | 'working' | 'done';

export interface Desk {
  id: DeskId;
  /** Two-letter mark used on the chart + log, e.g. "UX". */
  mark: string;
  name: string;
  role: string;
  /** One-sentence mandate — the copy on the node. */
  mandate: string;
  /** Longer dossier note for the ledger. */
  dossier: string;
  /** Verbatim capability list from the brief. */
  skills: string[];
  /** Median turnaround, used as a lightweight stat. */
  turnaround: string;
  /** How many draft variants / deliverables this desk produces. */
  yield: string;
}

export const DESKS: Desk[] = [
  {
    id: 'research',
    mark: 'RX',
    name: 'UX Researcher',
    role: 'Evidence',
    mandate:
      'Gathers evidence: runs competitive analyses (4–6 competitors), extracts UX patterns across industry patterns, and delivers structured adopt/avoid/replicate recommendations.',
    dossier:
      'Opens every brief by grounding it. Pulls four to six competitors, extracts the UX patterns they share, and files a structured adopt / avoid / replicate memo the rest of the floor works from.',
    skills: ['Competitive scan', 'Pattern extraction', 'Adopt / avoid / replicate'],
    turnaround: '~2 min',
    yield: '4–6 competitors',
  },
  {
    id: 'ux',
    mark: 'UX',
    name: 'UX Designer',
    role: 'Structure',
    mandate:
      'Creates wireframe sets (2–3 variants), defines the information architecture, documents user flows, and writes UX briefs.',
    dossier:
      'Turns research into skeleton. Produces two or three wireframe variants, defines the information architecture and navigation model, documents the primary flows, and hands a written UX brief to the UI desk.',
    skills: ['Wireframes ×2–3', 'Information architecture', 'User flows', 'UX brief'],
    turnaround: '~4 min',
    yield: '2–3 variants',
  },
  {
    id: 'ui',
    mark: 'UI',
    name: 'UI Designer',
    role: 'Surface',
    mandate:
      'Visual design across the wireframes into pixel-perfect screens using design tokens, and outlines the project’s handles interactive states.',
    dossier:
      'Lifts the wireframes to surface. Applies the design-token system for pixel-perfect screens, defines component states, and specifies the interactive behaviour the build will carry.',
    skills: ['Hi-fi screens', 'Design tokens', 'Component states', 'Interaction spec'],
    turnaround: '~5 min',
    yield: 'Pixel-perfect',
  },
  {
    id: 'content',
    mark: 'CD',
    name: 'Content Designer',
    role: 'Voice',
    mandate:
      'Writes all UX text, builds the terminology system, defines the voice and tone, and authors the project’s content style guide.',
    dossier:
      'Owns every word on the screen. Writes the interface copy, builds a shared terminology system so nothing is named twice in different ways, defines voice and tone, and authors the content style guide.',
    skills: ['UX copy', 'Terminology system', 'Voice & tone', 'Style guide'],
    turnaround: '~3 min',
    yield: 'Style guide',
  },
  {
    id: 'ops',
    mark: 'OP',
    name: 'Design Ops',
    role: 'Continuity',
    mandate:
      'Institutional memory: loads context at session start, logs decisions with reasoning, writes session summaries, and preserves the project’s state data.',
    dossier:
      'The studio’s memory. Loads the project context at session start, logs every decision with the reasoning behind it, writes the session summary, and preserves the state data so the next brief starts informed.',
    skills: ['Context load', 'Decision log', 'Session summary', 'State data'],
    turnaround: 'continuous',
    yield: 'Decision log',
  },
];

export const LEAD = {
  name: 'Design Lead',
  role: 'Direction & quality',
  mandate:
    'Strategic direction and quality gatekeeper. Sets the direction, resolves cross-desk trade-offs, and turns rough requirements into deliverables with actionable feedback.',
  dossier:
    'Reads the brief, sets the strategic direction, and dispatches the five desks. Resolves trade-offs between them, holds the quality bar, and turns rough requirements into shippable deliverables with actionable feedback.',
  skills: ['Direction', 'Trade-off calls', 'Quality gate', 'Dispatch'],
};

/* ---------------------------------------------------------------
   Run model: a run is a scripted timeline of beats per desk.
   Each beat is [desk, phase, log message, artifact?].
   The runner walks this list on timers; speed is tunable.
   --------------------------------------------------------------- */

export type Who = 'lead' | DeskId | 'studio';

export interface Beat {
  who: Who;
  phase?: Phase;
  msg: string;
  /** When a beat closes a desk, optionally attach an artifact. */
  artifact?: { title: string; body: string };
}

export interface RunScript {
  label: string;
  brief: string;
  beats: Beat[];
}

/** The preset briefs offered in the console. */
export const PRESETS: { id: string; label: string; brief: string }[] = [
  {
    id: 'onboarding',
    label: 'Onboarding flow',
    brief: 'Design a 3-step onboarding flow for a project-management app used by small creative teams.',
  },
  {
    id: 'pricing',
    label: 'Pricing page',
    brief: 'Design a pricing page for a usage-based API product with four tiers and an enterprise contact path.',
  },
  {
    id: 'empty',
    label: 'Empty states',
    brief: 'Design the empty and error states for a document editor’s sidebar, including first-run and no-results.',
  },
];

const ART = {
  research: {
    title: 'Adopt / avoid / replicate',
    body:
      'Scanned <strong>Linear, Asana, Notion, Height, Morgen</strong>. Adopt: a single “what are you here to do” fork. Avoid: five-field intake forms. Replicate Linear’s progressive disclosure on step two.',
  },
  ux: {
    title: 'User flow — 3-step fork',
    body:
      'Three variants: <strong>A)</strong> intent fork first, <strong>B)</strong> workspace naming first, <strong>C)</strong> blank-canvas with inline prompts. Primary flow = A. Nine wireframe frames, IA collapsed to four nodes.',
  },
  ui: {
    title: 'Hi-fi screens + tokens',
    body:
      'Tiered type scale applied; eight screens at 1440 / 768 / 375. <strong>36 tokens</strong> defined — colour, space, radius, elevation. Interactive states in: hover, focus, pressed, disabled, loading, error.',
  },
  content: {
    title: 'Voice, tone & style guide',
    body:
      'Voice: <strong>candid, unfussy, never cute.</strong> Terminology locked to 3 core nouns. 24 microcopy strings written, plus the style guide — sentence case, verbs first, no exclamation marks.',
  },
  ops: {
    title: 'Decision log — session 014',
    body:
      'Logged <strong>7 decisions</strong> with rationale. Chose fork-first (research-backed). Preserved state: component registry v3, token map, open question on enterprise SSO deferred to build.',
  },
};

/** Build a run script for whichever brief the user typed. Copy is
    brief-agnostic enough to read as real for all presets. */
export function buildScript(): RunScript {
  const beats: Beat[] = [
    { who: 'lead', phase: 'working', msg: 'Read the brief. Setting direction.' },
    { who: 'lead', msg: 'Scope is a 3-step flow, small-team voice. Dispatching five desks.' },
  ];

  const order: DeskId[] = ['research', 'ux', 'ui', 'content', 'ops'];

  // Opening: all five queued.
  for (const d of order) {
    beats.push({ who: d, phase: 'queued', msg: 'Brief received. In queue.' });
  }

  // Dispatch line.
  beats.push({ who: 'lead', phase: 'done', msg: 'Delegates work across all five desks.' });

  // Working lines, interleaved a little so it feels concurrent.
  const work: Record<DeskId, string[]> = {
    research: ['Pulling competitor set… found 6.', 'Extracting shared UX patterns…'],
    ux: ['Sketching variant A (intent fork)…', 'Laying out IA + primary flow…'],
    ui: ['Applying token scale…', 'Specifying interactive states…'],
    content: ['Naming the three core nouns…', 'Writing microcopy + tone notes…'],
    ops: ['Loading prior project context…', 'Decision log open. Capturing rationale…'],
  };

  for (const d of order) {
    beats.push({ who: d, phase: 'working', msg: work[d][0] });
  }
  for (const d of order) {
    beats.push({ who: d, phase: 'working', msg: work[d][1] });
  }

  // Close each desk with its artifact.
  const closing: Record<DeskId, string> = {
    research: 'Competitive memo filed to the floor.',
    ux: 'Wireframes + UX brief handed to UI.',
    ui: 'Pixel-perfect screens + states delivered.',
    content: 'Style guide + all copy delivered.',
    ops: 'Session logged. State preserved.',
  };
  for (const d of order) {
    beats.push({ who: d, phase: 'done', msg: closing[d], artifact: ART[d] });
  }

  // Review + sign-off.
  beats.push({ who: 'lead', phase: 'done', msg: 'Reviewing outputs against direction.' });
  beats.push({ who: 'studio', msg: 'Run complete. Deliverables assembled for review.' });

  return { label: 'Live run', brief: '', beats };
}

export const WHO_LABEL: Record<Who, string> = {
  lead: 'Lead',
  studio: 'Studio',
  research: 'Research',
  ux: 'UX',
  ui: 'UI',
  content: 'Content',
  ops: 'Ops',
};
