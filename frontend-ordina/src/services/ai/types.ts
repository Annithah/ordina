/**
 * The one interface every ORDINA AI provider implements (services/ai.ts picks one):
 *   direct  phone -> Gemini over HTTPS, key from SQLite (default)
 *   server  phone -> ORDINA backend -> Gemini (for a later public release)
 */
import type { CalendarBusyEvent } from '@/services/google-calendar';
import type { Plan } from '@/types/plan';

/** The open chat's last messages (see features/chat-groups contextWindow). */
export type ChatContext = { role: 'user' | 'assistant'; content: string }[];

export type UploadFile = { data: string; mimeType: string; name: string };

export type PlanRequest = {
  message: string;
  answers?: { question: string; answer: string }[];
  keepTasks?: unknown[];
  conversation?: ChatContext;
};

export type InterpretRequest = {
  message: string;
  conversation?: ChatContext;
  timezone?: string;
  contacts?: { name: string; phone?: string }[];
  calendarEvents?: CalendarBusyEvent[];
};

export type FilesRequest = {
  files: UploadFile[];
  note?: string;
  timezone?: string;
  calendarEvents?: CalendarBusyEvent[];
  conversation?: ChatContext;
};

export type ConfirmedPlan = { created: { id: string; title: string }[]; replayed?: boolean };

export type AiProvider = {
  /** Plain language -> plan for review (nothing is saved). */
  requestPlan(payload: PlanRequest): Promise<Plan>;
  /** Saves the reviewed plan exactly once per plan id. */
  confirmPlan(planId: string, tasks: unknown[]): Promise<ConfirmedPlan>;
  /** Chat reply (e.g. a tapped suggestion under a files answer). */
  interpretInstruction(payload: InterpretRequest): Promise<any>;
  confirmAiActions(payload: { tasks?: unknown[]; reschedule?: unknown; arrivalReminders?: unknown[] }): Promise<any>;
  /** Photos and files -> tasks (or an answer). `onProgress` gets 0..1 while the files upload. */
  interpretFromFiles(payload: FilesRequest, onProgress?: (fraction: number) => void): Promise<any>;
  transcribeAudio(audio: string, mimeType?: string): Promise<string>;
};
