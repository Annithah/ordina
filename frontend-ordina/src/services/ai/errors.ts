/**
 * ORDINA AI failures in plain words. Raw errors are never shown, and nothing mentions a server
 * or a computer: on the phone, ORDINA AI only needs internet.
 */
import { isAiError, type AiErrorCode } from '@/features/ai/gemini';
import { translate } from '@/i18n/translations';

/** The message key for each code; notice kinds (offline, slow, unreachable) use their own copy. */
const MESSAGE_KEY: Partial<Record<AiErrorCode | 'INVALID', string>> = {
  OFFLINE: 'ai.offlineSend',
  QUOTA: 'ai.limitReached',
  RATE_LIMITED: 'ai.tooFast',
  KEY_REJECTED: 'ai.unavailable',
  NOT_CONFIGURED: 'ai.unavailable',
  SAFETY: 'ai.safety',
  BAD_REQUEST: 'ai.badRequest',
  EMPTY: 'ai.emptyAnswer',
  INVALID: 'ai.emptyAnswer',
  FILE_TOO_MANY: 'ai.tooMany',
  FILE_TOO_LARGE: 'ai.tooLarge',
  FILES_TOO_LARGE: 'ai.filesTooLarge',
  FILE_UNSUPPORTED: 'ai.unsupported',
  FILE_EMPTY: 'ai.empty',
  FILE_UNREADABLE: 'ai.unreadableGeneric',
};

/** A friendly message for an ORDINA AI failure, or null when it is not one. */
export function friendlyAiMessage(error: unknown): string | null {
  const code = (error as { code?: string })?.code;
  if (!code || !(isAiError(error) || code === 'INVALID')) return null;
  const key = MESSAGE_KEY[code as AiErrorCode];
  if (key) return translate(key, isAiError(error) ? error.params : undefined);
  if (code === 'TIMEOUT') return translate('ai.slowBody');
  return translate('ai.unreachableBody');
}

/** True for problems with the attached files themselves (retrying the same files will not help). */
export function isFileProblem(error: unknown) {
  return isAiError(error) && error.code.startsWith('FILE');
}
