/** Shapes returned by POST /api/ai/plan (see backend-ordina/src/lib/planner.js). */

/** Where a value came from: the user's words, an ORDINA suggestion, or the user's learned habits. */
export type ValueSource = 'user' | 'ai' | 'habit';

export type PlanField = 'date' | 'startTime' | 'durationMinutes' | 'priority' | 'categoryId';

export type PlanPriority = 'low' | 'medium' | 'high';

export type PlanTask = {
  title: string;
  description: string | null;
  type: string;
  date: string;
  /** null: Anytime (no fixed time). */
  startTime: string | null;
  /** null: no duration. */
  durationMinutes: number | null;
  priority: PlanPriority;
  /** Suggested on the phone from the title; the user can change it in the preview. */
  categoryId: string;
  deadline: string | null;
  timeWindow: 'morning' | 'afternoon' | 'evening' | 'night' | null;
  sources: Record<Exclude<PlanField, 'categoryId'>, ValueSource> & { categoryId?: ValueSource };
  note: string | null;
  adjustedNote?: string;
  warnings: string[];
  /** What ORDINA proposed; sent back on confirm so edits can be learned. */
  original: {
    startTime: string | null;
    durationMinutes: number | null;
    priority: PlanPriority | null;
    sources: Record<Exclude<PlanField, 'categoryId'>, ValueSource>;
  };
};

export type PlanQuestion = {
  id: string;
  question: string;
  about: string | null;
  options: string[];
};

/** A task as the server sends it: no category yet (the phone suggests one). */
export type ServerPlanTask = Omit<PlanTask, 'categoryId'> & { categoryId?: string };

export type Plan = {
  planId: string;
  summary: string;
  tasks: ServerPlanTask[];
  questions: PlanQuestion[];
  assumptions: string[];
  today: string;
};

/** A task in the preview, with the fields the user has changed. */
export type DraftTask = PlanTask & { key: string; edited: Partial<Record<PlanField | 'title', true>> };
