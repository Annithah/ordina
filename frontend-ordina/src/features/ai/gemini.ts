/**
 * Gemini generateContent over HTTPS, straight from the phone. Pure: the HTTP transport is passed
 * in (XMLHttpRequest on the phone, fetch in tests), so this file has no React Native imports.
 *
 * Every failure becomes an AiError with a `code` the screens turn into a friendly message.
 * Neither the key nor Gemini's raw answer ever ends up in an error message.
 */

export const DEFAULT_MODEL = 'gemini-3.5-flash';
/** Tried after the configured model when it is busy, retired or not offered to this key. */
export const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest'];
export const ATTEMPT_TIMEOUT_MS = 30_000;
const NETWORK_RETRY_DELAY_MS = 1_000;
const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export type AiErrorCode =
  | 'OFFLINE'
  | 'NOT_CONFIGURED'
  | 'KEY_REJECTED'
  | 'QUOTA'
  | 'RATE_LIMITED'
  | 'SAFETY'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'BUSY'
  | 'BAD_REQUEST'
  | 'EMPTY'
  | 'FILE_TOO_MANY'
  | 'FILE_TOO_LARGE'
  | 'FILES_TOO_LARGE'
  | 'FILE_UNSUPPORTED'
  | 'FILE_EMPTY'
  | 'FILE_UNREADABLE';

export class AiError extends Error {
  code: AiErrorCode;
  /** Extra values for the friendly message (e.g. the file name). */
  params?: Record<string, string | number>;
  constructor(code: AiErrorCode, params?: Record<string, string | number>) {
    super(`ORDINA AI: ${code}`);
    this.name = 'AiError';
    this.code = code;
    this.params = params;
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError || (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AiError');
}

/** What the transport resolves with. It rejects with TransportError when no answer came back. */
export type TransportResponse = { status: number; text: string };
export type Transport = (request: { url: string; headers: Record<string, string>; body: string; timeoutMs: number }) => Promise<TransportResponse>;

export class TransportError extends Error {
  kind: 'timeout' | 'network';
  constructor(kind: 'timeout' | 'network') {
    super(kind === 'timeout' ? 'Request timed out' : 'Network request failed');
    this.kind = kind;
  }
}

/** A Transport built on fetch (Node 18+, browsers). */
export function fetchTransport(fetchImpl: typeof fetch = fetch): Transport {
  return async ({ url, headers, body, timeoutMs }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: 'POST', headers, body, signal: controller.signal });
      return { status: response.status, text: await response.text() };
    } catch {
      throw new TransportError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
  };
}

export type GenerateOptions = {
  key: string;
  model?: string | null;
  contents: unknown[];
  generationConfig?: Record<string, unknown>;
  transport: Transport;
  /** Total time across all attempts. */
  deadlineMs?: number;
  /** Limit for one attempt (30 seconds; longer for big file uploads). */
  attemptTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type GenerateResult = { text: string; model: string; finishReason: string | null; blockReason: string | null };

const BUSY_COOLDOWN_MS = 60_000;

// Model health for this app session: skip models that just said they are busy (an overloaded model
// can take 20+ seconds to say so) and start with the last one that answered.
const busyUntil = new Map<string, number>();
let lastWorkingModel: string | null = null;

export function resetModelHealth() {
  busyUntil.clear();
  lastWorkingModel = null;
}

export function modelsToTry(model?: string | null, now = Date.now()) {
  const all = [...new Set([String(model || '').trim() || DEFAULT_MODEL, ...FALLBACK_MODELS])];
  const ordered = lastWorkingModel && all.includes(lastWorkingModel) ? [lastWorkingModel, ...all.filter((name) => name !== lastWorkingModel)] : all;
  const ready = ordered.filter((name) => (busyUntil.get(name) ?? 0) <= now);
  // Models still cooling down are tried last rather than not at all.
  return [...ready, ...ordered.filter((name) => !ready.includes(name))];
}

/** Gemini answers an invalid key with 400 INVALID_ARGUMENT, so the body is checked too. */
function isKeyProblem(status: number, text: string) {
  return status === 401 || status === 403 || (status === 400 && /API[_ ]KEY|api key/i.test(text));
}

/**
 * Calls generateContent. Each attempt is limited to 30 seconds; a network failure (no answer)
 * is retried once. Busy, retired or quota-limited models fall through to the next model.
 */
export async function generate({ key, model, contents, generationConfig = {}, transport, deadlineMs = 45_000, attemptTimeoutMs = ATTEMPT_TIMEOUT_MS, sleep }: GenerateOptions): Promise<GenerateResult> {
  if (!key) throw new AiError('NOT_CONFIGURED');
  const wait = sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = Date.now() + deadlineMs;
  const body = JSON.stringify({ contents, generationConfig });
  let lastStatus = 0;
  let networkRetried = false;

  for (const name of modelsToTry(model)) {
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) throw new AiError(lastStatus === 429 ? 'QUOTA' : 'TIMEOUT');
      let response: TransportResponse;
      try {
        response = await transport({
          url: `${ENDPOINT}/${encodeURIComponent(name)}:generateContent`,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body,
          timeoutMs: Math.min(attemptTimeoutMs, remaining),
        });
      } catch (error) {
        if (error instanceof TransportError && error.kind === 'timeout') {
          busyUntil.set(name, Date.now() + BUSY_COOLDOWN_MS);
          throw new AiError('TIMEOUT');
        }
        // No answer at all (connection dropped, DNS): one automatic retry, then give up.
        if (networkRetried) throw new AiError('NETWORK');
        networkRetried = true;
        await wait(NETWORK_RETRY_DELAY_MS);
        continue;
      }

      if (response.status >= 200 && response.status < 300) {
        let payload: any;
        try {
          payload = JSON.parse(response.text);
        } catch {
          throw new AiError('EMPTY');
        }
        const candidate = payload?.candidates?.[0];
        lastWorkingModel = name;
        busyUntil.delete(name);
        return {
          text: candidate?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '',
          model: name,
          finishReason: candidate?.finishReason || null,
          blockReason: payload?.promptFeedback?.blockReason || null,
        };
      }

      lastStatus = response.status;
      if (isKeyProblem(response.status, response.text)) throw new AiError('KEY_REJECTED');
      if (response.status === 429 || response.status >= 500) busyUntil.set(name, Date.now() + BUSY_COOLDOWN_MS);
      if (response.status === 404) busyUntil.set(name, Date.now() + 10 * BUSY_COOLDOWN_MS);
      // 404 retired / not offered, 429 this model's free quota is used up, 5xx busy,
      // 400 e.g. "input modality not enabled": another model may still answer.
      break;
    }
  }
  if (lastStatus === 429) throw new AiError('QUOTA');
  if (lastStatus === 400) throw new AiError('BAD_REQUEST');
  throw new AiError('BUSY');
}

/**
 * Requests JSON constrained by `responseSchema` and returns the parsed object. Safety blocks and
 * empty or unreadable output become AiErrors.
 */
export async function generateJson(options: Omit<GenerateOptions, 'generationConfig'> & { responseSchema?: unknown; temperature?: number }) {
  const { responseSchema, temperature = 0.2, ...rest } = options;
  const result = await generate({
    ...rest,
    generationConfig: { temperature, responseMimeType: 'application/json', ...(responseSchema ? { responseSchema } : {}) },
  });
  if (result.blockReason || (result.finishReason && BLOCKED_FINISH.has(result.finishReason))) throw new AiError('SAFETY');
  const text = String(result.text || '').replace(/```json|```/g, '').trim();
  if (!text) throw new AiError('EMPTY');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AiError('EMPTY');
  }
}

/** Plain text answer (voice transcription). */
export async function generateText(options: GenerateOptions) {
  const result = await generate(options);
  if (result.blockReason || (result.finishReason && BLOCKED_FINISH.has(result.finishReason))) throw new AiError('SAFETY');
  return result.text;
}
