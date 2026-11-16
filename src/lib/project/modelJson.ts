/* ============================================================
   Defensive JSON parsing for model replies.

   Models wrap JSON in markdown fences, prepend a sentence of
   preamble, or trail a closing remark. None of that is a reason to
   fail a stage — but none of it is trustworthy either. This module
   extracts the first JSON value and hands it to a caller-supplied
   validator, so every model-backed path either yields a shape the
   rest of the pipeline already understands, or throws and lets the
   deterministic fallback run.
   ============================================================ */

/** Strip ```json fences and any prose around the first JSON value. */
export function extractJson(text: string): unknown {
  let s = text.trim();

  // Fenced block, if present, is the most likely payload.
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/.exec(s);
  if (fence) s = fence[1].trim();

  // Otherwise cut from the first brace/bracket to the last matching one.
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
  if (start > 0) s = s.slice(start);
  if (start !== -1) {
    const lastObj = s.lastIndexOf('}');
    const lastArr = s.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);
    if (end !== -1) s = s.slice(0, end + 1);
  }

  return JSON.parse(s);
}

/**
 * Parse a model reply and validate it. Throws on anything unexpected —
 * callers treat a throw as "use the deterministic path".
 */
export function parseJsonReply<T>(text: string, validate: (v: unknown) => T): T {
  if (!text || !text.trim()) throw new Error('The model returned an empty reply.');
  return validate(extractJson(text));
}

/* --- small shape helpers, shared by the validators ---------------- */

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown, max = 4000): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

export function strArray(v: unknown, maxItems = 12, maxLen = 400): string[] | null {
  if (!Array.isArray(v) || v.length > maxItems) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, maxLen);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/* --- the fallback contract ---------------------------------------- */

export interface ModelOutcome<T> {
  value: T;
  /** Which path produced this — surfaced in the UI so it's never a guess. */
  source: 'model' | 'fallback';
  /** Why the fallback ran, when it did. */
  note?: string;
}

/**
 * Run a model-backed stage, falling back to the deterministic result on
 * any failure. A model is an enhancement here, never a dependency: an
 * unreachable endpoint, a malformed reply or an abort must leave the
 * studio working, with a note saying what happened.
 */
export async function withFallback<T>(
  label: string,
  run: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<ModelOutcome<T>> {
  try {
    return { value: await run(), source: 'model' };
  } catch (e) {
    const note = e instanceof Error ? e.message : 'The model call failed.';
    console.warn(`[atelier] ${label}: falling back to the deterministic path — ${note}`);
    return { value: await fallback(), source: 'fallback', note };
  }
}
