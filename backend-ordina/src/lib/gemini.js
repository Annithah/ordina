/**
 * Google Gemini client (REST generateContent). The key never leaves the backend.
 *
 * Env:
 *   GEMINI_API_KEY          required for any AI feature
 *   GEMINI_MODEL            preferred model (default below)
 *   GEMINI_FALLBACK_MODELS  optional comma-separated fallbacks
 *
 * Errors carry `status` (HTTP status for our API) and `code` so routes can show
 * a friendly message: AI_NOT_CONFIGURED, AI_KEY_REJECTED, AI_QUOTA, AI_BUSY,
 * AI_TIMEOUT, AI_BAD_REQUEST, AI_SAFETY, AI_EMPTY.
 */

const DEFAULT_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];
const BUSY_COOLDOWN_MS = 60_000;
const ATTEMPT_TIMEOUT_MS = 30_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

// Model health shared across requests: skip models that just reported overload, start with the last one that worked.
const busyUntil = new Map();
let lastWorkingModel = null;

function aiError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function configuredModel() {
  return String(process.env.GEMINI_MODEL || '').trim() || DEFAULT_MODELS[0];
}

function geminiModels() {
  const configured = [process.env.GEMINI_MODEL, ...(process.env.GEMINI_FALLBACK_MODELS || '').split(',')]
    .map((model) => String(model || '').trim())
    .filter(Boolean);
  const all = [...new Set([...configured, ...DEFAULT_MODELS])];
  const ordered = lastWorkingModel && all.includes(lastWorkingModel)
    ? [lastWorkingModel, ...all.filter((model) => model !== lastWorkingModel)]
    : all;
  const now = Date.now();
  const ready = ordered.filter((model) => (busyUntil.get(model) || 0) <= now);
  // If everything is cooling down, still try them all rather than failing outright.
  return ready.length ? [...ready, ...ordered.filter((model) => !ready.includes(model))] : ordered;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Gemini generateContent, retrying busy models and falling back through
 * GEMINI_MODEL, GEMINI_FALLBACK_MODELS and sensible defaults.
 * Returns { text, model, finishReason, blockReason }.
 * `deadlineMs` caps the total time spent across all attempts.
 */
async function geminiGenerate(contents, generationConfig = {}, { deadlineMs = 120_000 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw aiError('ORDINA AI is not available right now.', 503, 'AI_NOT_CONFIGURED');
  const deadline = Date.now() + deadlineMs;
  let lastStatus = 0;
  let lastMessage = '';
  for (const model of geminiModels()) {
    // Busy (503) models are skipped immediately; rate limits (429) get one short retry.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 1500) {
        throw aiError('ORDINA AI took too long to answer. Please try again.', 504, 'AI_TIMEOUT');
      }
      let response;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents, generationConfig }),
          signal: AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, remaining)),
        });
      } catch (error) {
        // Timed out or network failure: treat the model as busy and move on.
        lastStatus = 504;
        lastMessage = error.message;
        busyUntil.set(model, Date.now() + BUSY_COOLDOWN_MS);
        break;
      }
      if (response.ok) {
        const payload = await response.json();
        lastWorkingModel = model;
        busyUntil.delete(model);
        const candidate = payload.candidates?.[0];
        return {
          text: candidate?.content?.parts?.map((part) => part.text || '').join('') || '',
          model,
          finishReason: candidate?.finishReason || null,
          blockReason: payload.promptFeedback?.blockReason || null,
        };
      }
      lastStatus = response.status;
      lastMessage = await response.text().catch(() => '');
      if (response.status === 503 || response.status === 429) {
        busyUntil.set(model, Date.now() + BUSY_COOLDOWN_MS);
      }
      // Retired / not offered to this key / quota exhausted on this model: try the next one.
      if (response.status === 404 || (response.status === 429 && /quota/i.test(lastMessage))) {
        busyUntil.set(model, Date.now() + 10 * BUSY_COOLDOWN_MS);
        break;
      }
      if (response.status === 401 || response.status === 403) {
        console.error(`ORDINA Gemini ${model} auth failed`, response.status);
        throw aiError('ORDINA AI is not available right now.', 502, 'AI_KEY_REJECTED');
      }
      if (!RETRYABLE.has(response.status)) {
        // e.g. 400 "input modality not enabled" on this model: another model may accept it.
        console.error(`ORDINA Gemini ${model} refused`, response.status);
        break;
      }
      if (response.status !== 429) break;
      await sleep(800);
    }
  }
  console.error('ORDINA Gemini unavailable', lastStatus);
  if (lastStatus === 400) throw aiError('ORDINA AI could not read that. Try a clearer photo, a shorter video, or rephrase it.', 400, 'AI_BAD_REQUEST');
  if (lastStatus === 429) throw aiError('ORDINA AI has reached its usage limit. Please try again later.', 429, 'AI_QUOTA');
  if (lastStatus === 504) throw aiError('ORDINA AI took too long to answer. Please try again.', 504, 'AI_TIMEOUT');
  throw aiError('ORDINA AI is very busy right now. Please try again in a moment.', 503, 'AI_BUSY');
}

/** Text-only helper kept for the existing chat, media and transcription features. */
async function geminiText(contents, generationConfig = {}) {
  const { text } = await geminiGenerate(contents, generationConfig);
  return text;
}

/**
 * Requests JSON constrained by `responseSchema` and returns the parsed object.
 * Safety blocks and empty / unparseable output become typed errors.
 */
async function geminiJson(contents, { responseSchema, temperature = 0.2, deadlineMs } = {}) {
  const result = await geminiGenerate(
    contents,
    { temperature, responseMimeType: 'application/json', ...(responseSchema ? { responseSchema } : {}) },
    { deadlineMs },
  );
  if (result.blockReason || BLOCKED_FINISH.has(result.finishReason)) {
    throw aiError('ORDINA AI could not help with that request. Try rephrasing it.', 422, 'AI_SAFETY');
  }
  const text = String(result.text || '').replace(/```json|```/g, '').trim();
  if (!text) throw aiError('ORDINA AI returned an empty answer. Please try again.', 502, 'AI_EMPTY');
  try {
    return JSON.parse(text);
  } catch {
    throw aiError('ORDINA AI returned an answer we could not read. Please try again.', 502, 'AI_EMPTY');
  }
}

module.exports = { configuredModel, geminiGenerate, geminiJson, geminiText, isConfigured };
