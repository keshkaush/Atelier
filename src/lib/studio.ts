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

/** The assembled result of a run — what "deliverables for review" means. */
export interface Deliverable {
  /** The brief this run answered, verbatim. */
  brief: string;
  /** One line the Lead signs off with. */
  headline: string;
  sections: { desk: DeskId; title: string; body: string }[];
  /** What the studio could not settle from the brief alone. */
  openQuestions: string[];
}

export interface RunScript {
  label: string;
  brief: string;
  beats: Beat[];
  deliverable: Deliverable;
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

/* ---------------------------------------------------------------
   Reading the brief.

   The console used to ignore the brief entirely: `buildScript()` took
   no arguments and every preset produced identical copy. These helpers
   derive the run's shape from the text, so three different briefs give
   three different runs. They are deliberately shallow — this is a
   scripted simulation, not a model — but they are honest: every claim
   below is traceable to a word in the brief.
   --------------------------------------------------------------- */

/** What kind of surface the brief is asking for. */
type Intent = 'onboarding' | 'pricing' | 'states' | 'dashboard' | 'marketing' | 'general';

interface Reading {
  intent: Intent;
  /** The noun phrase the brief is about, e.g. "onboarding flow". */
  subject: string;
  /** Who the product serves, if the brief says. */
  audience: string;
  /** False when `audience` is the generic fallback. */
  audienceNamed: boolean;
  /** Step count, when the brief names one. */
  steps: number | null;
  /** Tier count, when the brief names one. */
  tiers: number | null;
  /** Named constraints the brief calls out (theme, platform, tone…). */
  constraints: string[];
  /** Product category, for the research desk. */
  category: string;
}

/**
 * Order matters — the first match wins. `states` is checked before
 * `onboarding` because a brief about "first-run empty states" is about
 * states, not about onboarding, even though it says "first-run".
 */
const INTENT_RULES: { intent: Intent; re: RegExp }[] = [
  { intent: 'states', re: /empty|error|no.?results|loading state|zero state/i },
  { intent: 'pricing', re: /pricing|tier|plan|billing|subscription|paywall/i },
  { intent: 'onboarding', re: /onboard|sign\s?-?up|first.?run|wizard|getting started/i },
  { intent: 'dashboard', re: /dashboard|board|kanban|analytics|report/i },
  { intent: 'marketing', re: /landing|marketing|homepage|hero|waitlist/i },
];

const CATEGORY_RULES: { re: RegExp; name: string }[] = [
  { re: /project.?management|task|kanban|sprint/i, name: 'project management' },
  { re: /api|developer|sdk|platform/i, name: 'developer tooling' },
  { re: /document|editor|writing|notes/i, name: 'document editing' },
  { re: /commerce|shop|store|checkout|cart/i, name: 'commerce' },
  { re: /health|fitness|wellness/i, name: 'health' },
  { re: /finance|bank|payment|invoice/i, name: 'finance' },
  { re: /education|course|learning|student/i, name: 'education' },
];

/** Pull a short noun phrase out of the brief for use in copy. */
function subjectOf(brief: string, intent: Intent): string {
  const named = /\b(?:the|a|an)\s+([a-z][a-z\s-]{2,40}?)\s+(?:flow|page|screen|view|state|states|wizard|dashboard|form)\b/i.exec(
    brief,
  );
  if (named) return named[0].replace(/^(the|a|an)\s+/i, '').trim().toLowerCase();
  switch (intent) {
    case 'onboarding':
      return 'onboarding flow';
    case 'pricing':
      return 'pricing page';
    case 'states':
      return 'empty and error states';
    case 'dashboard':
      return 'dashboard';
    case 'marketing':
      return 'landing page';
    default:
      return 'the requested surface';
  }
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

/** "3" or "three" → 3. */
function countOf(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : (WORD_NUMBERS[raw.toLowerCase()] ?? 0);
}

/** People-nouns that end an audience phrase. */
const PEOPLE_NOUN =
  /(teams?|users?|people|developers?|designers?|students?|businesses|customers?|admins?|creators?|engineers?|managers?|founders?|operators?|freelancers?|agencies)$/i;

/**
 * Find who the product serves.
 *
 * A single regex over "for …" over-captures: in "for a project-management
 * app used by small creative teams" the audience is the *teams*, not the
 * app. So the brief is cut at every preposition and each segment is tested
 * on its own; the last segment ending in a people-noun wins, because that
 * is the innermost description of the audience.
 */
function audienceOf(brief: string): { audience: string; named: boolean } {
  const prep = /\b(?:for|by|to)\s+/gi;
  const starts: number[] = [];
  for (let m = prep.exec(brief); m; m = prep.exec(brief)) {
    starts.push(m.index + m[0].length);
  }

  let best = '';
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : brief.length;
    const segment = brief
      .slice(starts[i], end)
      // Stop at the first clause boundary or conjunction.
      .split(/[,.;:]|\s+(?:with|that|who|which|used|including|and)\b/i)[0]
      .replace(/^(?:a|an|the)\s+/i, '')
      .trim();
    if (segment && PEOPLE_NOUN.test(segment)) best = segment;
  }
  return best
    ? { audience: best.toLowerCase(), named: true }
    : { audience: 'the product’s users', named: false };
}

function readBrief(brief: string): Reading {
  const b = brief.trim();
  const intent = INTENT_RULES.find((r) => r.re.test(b))?.intent ?? 'general';

  const stepMatch = /\b(\d+|one|two|three|four|five|six)[- ]step\b/i.exec(b);
  const tierMatch = /\b(\d+|one|two|three|four|five|six)\s+tiers?\b/i.exec(b);

  const { audience, named: audienceNamed } = audienceOf(b);

  const constraints: string[] = [];
  if (/dark (theme|mode)/i.test(b)) constraints.push('dark theme');
  if (/light (theme|mode)/i.test(b)) constraints.push('light theme');
  if (/mobile|responsive|small screen/i.test(b)) constraints.push('mobile-first');
  if (/accessib|a11y|screen reader/i.test(b)) constraints.push('accessibility');
  if (/enterprise|sso|saml/i.test(b)) constraints.push('enterprise path');
  if (/keep|preserv|existing|current/i.test(b)) constraints.push('preserve current system');

  return {
    intent,
    subject: subjectOf(b, intent),
    audience,
    audienceNamed,
    steps: stepMatch ? countOf(stepMatch[1]) : null,
    tiers: tierMatch ? countOf(tierMatch[1]) : null,
    constraints,
    category: CATEGORY_RULES.find((r) => r.re.test(b))?.name ?? 'the category',
  };
}

/** Competitor sets, chosen by product category rather than hardcoded. */
const COMPETITORS: Record<string, string[]> = {
  'project management': ['Linear', 'Asana', 'Height', 'Notion', 'Morgen'],
  'developer tooling': ['Stripe', 'Vercel', 'Twilio', 'Supabase', 'Postman'],
  'document editing': ['Notion', 'Craft', 'Coda', 'Bear', 'Obsidian'],
  commerce: ['Shopify', 'Etsy', 'Gumroad', 'Stripe Checkout', 'Amazon'],
  health: ['Headspace', 'Calm', 'Whoop', 'Oura', 'Strava'],
  finance: ['Monzo', 'Wise', 'Ramp', 'Mercury', 'Brex'],
  education: ['Duolingo', 'Khan Academy', 'Coursera', 'Brilliant', 'Maven'],
  'the category': ['Linear', 'Notion', 'Stripe', 'Figma', 'Superhuman'],
};

/** The pattern each intent should adopt, and the one it should avoid. */
const PATTERNS: Record<Intent, { adopt: string; avoid: string; replicate: string }> = {
  onboarding: {
    adopt: 'a single “what are you here to do” fork on step one',
    avoid: 'five-field intake forms before any value is shown',
    replicate: 'progressive disclosure — ask for the second thing only after the first is answered',
  },
  pricing: {
    adopt: 'a recommended tier that is visually distinct, not just first',
    avoid: 'feature-comparison tables that need horizontal scrolling',
    replicate: 'usage sliders that price in place, so the number never surprises at checkout',
  },
  states: {
    adopt: 'empty states that name the next action, not the absence',
    avoid: 'illustration-only empty states with no way forward',
    replicate: 'error copy that says what happened, what it means, and what to do next',
  },
  dashboard: {
    adopt: 'one primary metric per card, with the trend beside it',
    avoid: 'dense tables as the default view',
    replicate: 'progressive density — summary first, detail on demand',
  },
  marketing: {
    adopt: 'a single primary action repeated at each scroll depth',
    avoid: 'hero carousels that hide the value proposition',
    replicate: 'proof placed next to the claim it supports',
  },
  general: {
    adopt: 'one clear primary action per screen',
    avoid: 'competing calls to action of equal weight',
    replicate: 'the existing navigation model rather than inventing a parallel one',
  },
};

/** Build a run script for whichever brief the user typed. */
export function buildScript(brief = ''): RunScript {
  const r = readBrief(brief);
  const p = PATTERNS[r.intent];
  const competitors = COMPETITORS[r.category] ?? COMPETITORS['the category'];
  const constraintLine = r.constraints.length
    ? ` Constraints: ${r.constraints.join(', ')}.`
    : '';

  const steps = r.steps ?? (r.intent === 'onboarding' ? 3 : 4);
  const tiers = r.tiers ?? (r.intent === 'pricing' ? 4 : 0);

  // --- artifacts, each derived from the reading -------------------
  const art: Record<DeskId, { title: string; body: string }> = {
    research: {
      title: 'Adopt / avoid / replicate',
      body:
        `Scanned <strong>${competitors.join(', ')}</strong> for ${r.category}. ` +
        `Adopt: ${p.adopt}. Avoid: ${p.avoid}. Replicate: ${p.replicate}.`,
    },
    ux: {
      title: `User flow — ${r.subject}`,
      body:
        (r.intent === 'onboarding'
          ? `Three variants: <strong>A)</strong> intent fork first, <strong>B)</strong> naming first, <strong>C)</strong> blank canvas with inline prompts. Primary flow = A, ${steps} steps.`
          : r.intent === 'pricing'
            ? `Two variants: <strong>A)</strong> ${tiers} tiers in a row with the recommended one raised, <strong>B)</strong> usage-first with tiers revealed after the slider. Primary = A.`
            : r.intent === 'states'
              ? `Four states mapped: first-run, no-results, error, and partial-load. Each gets a wireframe with the recovery action placed above the fold.`
              : `Two variants for ${r.subject}: <strong>A)</strong> summary-first, <strong>B)</strong> detail-first. Primary = A.`) +
        ` IA collapsed to ${Math.max(3, steps)} nodes.`,
    },
    ui: {
      title: 'Hi-fi screens + tokens',
      body:
        `Tiered type scale applied; ${Math.max(4, steps + 3)} screens at 1440 / 768 / 375. ` +
        `<strong>${28 + steps * 2} tokens</strong> defined — colour, space, radius, elevation. ` +
        `Interactive states in: hover, focus, pressed, disabled, loading, error.` +
        (r.constraints.includes('dark theme') ? ' Dark theme is the primary surface; light is derived.' : ''),
    },
    content: {
      title: 'Voice, tone & style guide',
      body:
        `Voice: <strong>candid, unfussy, never cute.</strong> Terminology locked to ${Math.max(2, steps - 1)} core nouns. ` +
        `${12 + steps * 4} microcopy strings written for ${r.audience}, plus the style guide — sentence case, verbs first, no exclamation marks.`,
    },
    ops: {
      title: 'Decision log — session 014',
      body:
        `Logged <strong>${5 + r.constraints.length} decisions</strong> with rationale. ` +
        `Chose ${r.intent === 'onboarding' ? 'fork-first' : r.intent === 'pricing' ? 'recommended-tier-first' : 'summary-first'} (research-backed). ` +
        `Preserved state: component registry v3, token map.` +
        (r.constraints.includes('enterprise path') ? ' Enterprise SSO deferred to build.' : ''),
    },
  };

  const beats: Beat[] = [
    { who: 'lead', phase: 'working', msg: 'Read the brief. Setting direction.' },
    {
      who: 'lead',
      msg:
        `Scope is ${r.subject} for ${r.audience}.` +
        // Only name the shape that applies — a pricing page has tiers, not
        // steps, and saying both would be noise.
        (r.intent === 'onboarding' ? ` ${steps} steps.` : '') +
        (r.intent === 'pricing' ? ` ${tiers} tiers.` : '') +
        `${constraintLine} Dispatching five desks.`,
    },
  ];

  const order: DeskId[] = ['research', 'ux', 'ui', 'content', 'ops'];

  for (const d of order) {
    beats.push({ who: d, phase: 'queued', msg: 'Brief received. In queue.' });
  }

  beats.push({ who: 'lead', phase: 'done', msg: 'Delegates work across all five desks.' });

  const work: Record<DeskId, string[]> = {
    research: [
      `Pulling ${competitors.length} competitors in ${r.category}…`,
      'Extracting shared UX patterns…',
    ],
    ux: [
      r.intent === 'onboarding'
        ? `Sketching variant A (intent fork)…`
        : `Sketching variant A for ${r.subject}…`,
      `Laying out IA + primary flow…`,
    ],
    ui: ['Applying token scale…', 'Specifying interactive states…'],
    content: [
      `Naming the ${Math.max(2, steps - 1)} core nouns…`,
      `Writing microcopy for ${r.audience}…`,
    ],
    ops: ['Loading prior project context…', 'Decision log open. Capturing rationale…'],
  };

  for (const d of order) {
    beats.push({ who: d, phase: 'working', msg: work[d][0] });
  }
  for (const d of order) {
    beats.push({ who: d, phase: 'working', msg: work[d][1] });
  }

  const closing: Record<DeskId, string> = {
    research: 'Competitive memo filed to the floor.',
    ux: 'Wireframes + UX brief handed to UI.',
    ui: 'Pixel-perfect screens + states delivered.',
    content: 'Style guide + all copy delivered.',
    ops: 'Session logged. State preserved.',
  };
  for (const d of order) {
    beats.push({ who: d, phase: 'done', msg: closing[d], artifact: art[d] });
  }

  beats.push({ who: 'lead', phase: 'done', msg: 'Reviewing outputs against direction.' });
  beats.push({ who: 'studio', msg: 'Run complete. Deliverables assembled for review.' });

  // --- the assembled deliverable ---------------------------------
  const openQuestions: string[] = [];
  if (r.steps === null && r.intent === 'onboarding') {
    openQuestions.push('How many steps? Assumed three — confirm before build.');
  }
  if (r.tiers === null && r.intent === 'pricing') {
    openQuestions.push('How many tiers? Assumed four — confirm before build.');
  }
  if (!r.constraints.length) {
    openQuestions.push('No visual constraints in the brief — theme and platform are unconfirmed.');
  }
  if (!r.audienceNamed) {
    openQuestions.push('Audience was not named; copy is written for a general user.');
  }

  // The headline names the shape that actually applies to this intent —
  // "4-step structure" is meaningless for a pricing page.
  const shape =
    r.intent === 'onboarding'
      ? `${steps} steps`
      : r.intent === 'pricing'
        ? `${tiers} tiers`
        : r.intent === 'states'
          ? '4 states'
          : `${Math.max(4, steps + 3)} screens`;
  const constraintText = r.constraints.length
    ? r.constraints.join(' / ')
    : 'no stated constraints';

  return {
    label: 'Live run',
    brief: brief.trim(),
    beats,
    deliverable: {
      brief: brief.trim(),
      headline: `${r.subject.charAt(0).toUpperCase()}${r.subject.slice(1)} — ${shape}, ${constraintText}.`,
      sections: order.map((d) => ({ desk: d, title: art[d].title, body: art[d].body })),
      openQuestions,
    },
  };
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
