/* ============================================================
   Model adapter — the one file to touch to make a desk *real*.

   It speaks the OpenAI-compatible chat-completions API, which is
   the same shape OpenRouter, Together, Groq, local Ollama/LM Studio,
   and OpenAI itself all expose. Point `baseUrl`, `apiKey` and `model`
   at whichever you want and call `complete()`.

   Nothing here runs until you call it — the demo stays offline and
   instant by default. See README.md ("Attach a real model").
   ============================================================ */

export interface ModelConfig {
  /** OpenAI-compatible base URL. OpenRouter: https://openrouter.ai/api/v1 */
  baseUrl: string;
  /** Bearer token. OpenRouter free models still need a key. */
  apiKey: string;
  /** Model id, e.g. "meta-llama/llama-3.3-70b-instruct:free". */
  model: string;
  /** Optional: OpenRouter uses these for attribution/rankings. */
  appName?: string;
  appUrl?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Read config from Vite env vars (see .env.example). */
export function configFromEnv(): ModelConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_AI_API_KEY;
  if (!apiKey) return null;
  return {
    baseUrl: env.VITE_AI_BASE_URL || 'https://openrouter.ai/api/v1',
    apiKey,
    model: env.VITE_AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    appName: env.VITE_AI_APP_NAME || 'Atelier',
    appUrl: env.VITE_AI_APP_URL,
  };
}

/** Ceiling on any single model request. Generous: these are small prompts. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Combine a caller signal with a timeout into one controller-backed
 * signal. `AbortSignal.any` / `AbortSignal.timeout` are ES2024 and outside
 * this project's lib target, so the wiring is explicit.
 *
 * Returns the signal plus a `done()` the caller MUST invoke when the
 * request settles, so a successful fast reply doesn't leave a 60s timer
 * holding the event loop (which would hang `node --test` runs).
 */
function composeSignals(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new Error('The model request timed out.')),
    timeoutMs,
  );
  const done = () => clearTimeout(timer);
  ctrl.signal.addEventListener('abort', done, { once: true });
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true });
  }
  return { signal: ctrl.signal, done };
}

/**
 * One chat completion. Returns the assistant's text.
 * Use this per desk: give each desk a system prompt (its mandate) and the
 * user's brief, and its reply becomes that desk's artifact.
 */
export async function complete(
  cfg: ModelConfig,
  messages: ChatMessage[],
  opts: { temperature?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  // OpenRouter attribution headers (harmless elsewhere).
  if (cfg.appName) headers['X-Title'] = cfg.appName;
  if (cfg.appUrl) headers['HTTP-Referer'] = cfg.appUrl;

  // A model that never answers must not leave a stage busy forever: the
  // request is bounded, and the abort surfaces as a normal rejection so
  // the caller's deterministic fallback runs.
  const guard = composeSignals(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal: guard.signal,
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.7,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Model request failed (${res.status}). ${detail}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  } finally {
    guard.done();
  }
}

/**
 * Streaming variant — calls `onToken` as text arrives so a desk card can
 * "type" its answer live in the UI.
 */
export async function stream(
  cfg: ModelConfig,
  messages: ChatMessage[],
  onToken: (chunk: string) => void,
  opts: { signal?: AbortSignal } = {},
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
  if (cfg.appName) headers['X-Title'] = cfg.appName;
  if (cfg.appUrl) headers['HTTP-Referer'] = cfg.appUrl;

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    signal: opts.signal,
    body: JSON.stringify({ model: cfg.model, messages, stream: true }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Model stream failed (${res.status}). ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const json = JSON.parse(payload);
        const delta: string = json.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch {
        /* ignore keep-alive / partial lines */
      }
    }
  }
  return full.trim();
}
