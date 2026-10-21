/** Shapes returned by POST /api/ai/plan (see backend-ordina/src/lib/planner.js). */

/** Where a value came from: the user's words, an ORDINA suggestion, or the user's learned habits. */
export type ValueSource = 'user' | 'ai' | 'habit';

export type PlanField = 'date' | 'startTime' | 'durationMinutes' | 'priority';

export type PlanPriority = 'low' | 'medium' | 'high';

export type PlanTask = {
  title: string;
  description: string | null;
  type: string;
  date: string;
  startTime: string | null;
  durationMinutes: number;
  priority: PlanPriority;
  deadline: string | null;
  timeWindow: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  sources: Record<PlanField, ValueSource>;
  note: string | null;
  adjustedNote?: string;
  warnings: string[];
  /** What ORDINA proposed; sent back on confirm so edits can be learned. */
  original: {
    startTime: string | null;
    durationMinutes: number | null;
    priority: PlanPriority | null;
    sources: Record<PlanField, ValueSource>;
  };
};

export type PlanQuestion = {
  id: string;
  question: string;
  about: string | null;
  options: string[];
};

export type Plan = {
  planId: string;
  summary: string;
  tasks: PlanTask[];
  questions: PlanQuestion[];
  assumptions: string[];
  today: string;
};

/** A task in the preview, with the fields the user has changed. */
export type DraftTask = PlanTask & {
  key: string;
  edited: Partial<Record<PlanField | 'title', true>>;
  /** The category the task will be saved in; the user can change it in the preview. */
  category: string;
  /** What ORDINA suggested (null when nothing fitted), so a change can be learned. */
  suggestedCategory: string | null;
};
