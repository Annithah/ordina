/**
 * ORDINA AI on the phone: reads the Gemini key and model from SQLite (app_config) and calls the
 * Gemini API over HTTPS. No ORDINA server and no computer are involved; only internet is needed.
 *
 * Before each request: internet check (OFFLINE) and the local allowance (10 a minute, 100 a day,
 * kept in SQLite so restarting the app does not reset it).
 */
import { AiError, TransportError, generateJson, generateText, type Transport } from '@/features/ai/gemini';
import { takeRequest, type UsageState } from '@/features/ai/rate-limit';
import { getConfig } from '@/services/app-config';
import { isOnline } from '@/services/connectivity';
import { getMeta, setMeta } from '@/services/local-tasks';

const USAGE_KEY = 'ai.usage.v1';

/** XMLHttpRequest transport: React Native's fetch cannot report upload progress for big files. */
function xhrTransport(onUploadProgress?: (fraction: number) => void): Transport {
  return ({ url, headers, body, timeoutMs }) => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.timeout = timeoutMs;
    if (onUploadProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total) onUploadProgress(Math.min(1, event.loaded / event.total));
      };
    }
    xhr.onload = () => {
      onUploadProgress?.(1);
      resolve({ status: xhr.status, text: String(xhr.responseText ?? '') });
    };
    xhr.ontimeout = () => reject(new TransportError('timeout'));
    xhr.onerror = () => reject(new TransportError('network'));
    xhr.onabort = () => reject(new TransportError('network'));
    xhr.send(body);
  });
}

// Requests are counted one at a time so two quick taps cannot both slip past the limit.
let usageQueue: Promise<unknown> = Promise.resolve();

function countRequest() {
  const step = usageQueue.then(async () => {
    const result = takeRequest(await getMeta<UsageState | null>(USAGE_KEY, null));
    await setMeta(USAGE_KEY, result.next);
    if (!result.allowed) throw new AiError(result.reason === 'day' ? 'QUOTA' : 'RATE_LIMITED');
  });
  usageQueue = step.catch(() => undefined);
  return step;
}

/** Everything a request needs, or the reason it cannot be sent. */
async function prepare() {
  if (!(await isOnline())) throw new AiError('OFFLINE');
  const [key, model] = await Promise.all([getConfig('gemini_api_key'), getConfig('gemini_model')]);
  if (!key) throw new AiError('NOT_CONFIGURED');
  await countRequest();
  return { key, model };
}

/** A failure with no answer, while the phone has just lost its connection, is "offline". */
async function explain(error: unknown): Promise<never> {
  if (error instanceof AiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT') && !(await isOnline())) {
    throw new AiError('OFFLINE');
  }
  throw error;
}

type JsonOptions = { responseSchema?: unknown; temperature?: number; deadlineMs?: number; attemptTimeoutMs?: number; onUploadProgress?: (fraction: number) => void };

export async function geminiJson(contents: unknown[], { responseSchema, temperature, deadlineMs = 45_000, attemptTimeoutMs, onUploadProgress }: JsonOptions = {}) {
  const { key, model } = await prepare();
  return generateJson({ key, model, contents, responseSchema, temperature, deadlineMs, attemptTimeoutMs, transport: xhrTransport(onUploadProgress) }).catch(explain);
}

export async function geminiText(contents: unknown[], { deadlineMs = 45_000 }: { deadlineMs?: number } = {}) {
  const { key, model } = await prepare();
  return generateText({ key, model, contents, deadlineMs, transport: xhrTransport() }).catch(explain);
}
