/**
 * What the user chose in the intro questions becomes ORDINA's starting point:
 * their best hours, how they want reminders and the areas they plan for.
 */
import { DEFAULT_CATEGORY, focusGroups, splitCategories } from './categories.ts';

type Answers = Record<string, string[] | undefined>;

/** "When do you do your best work?" -> a start time to offer first. */
const ENERGY_TIME: Record<string, string> = {
  early: '07:00',
  morning: '09:30',
  afternoon: '14:00',
  evening: '18:00',
  night: '20:30',
};

export function bestTime(answers: Answers): string | undefined {
  const energy = answers.energy?.[0];
  return energy ? ENERGY_TIME[energy] : undefined;
}

/**
 * "How should ORDINA remind you?" -> minutes before the task for a new task's reminder,
 * or null for no reminder. "Only important things" reminds only for high priority.
 */
export function defaultReminderLead(answers: Answers, priority: string): number | null {
  switch (answers.reminders?.[0]) {
    case 'before':
      return 10;
    case 'night':
      return 24 * 60;
    case 'important':
      return priority === 'high' ? 30 : null;
    default:
      return null;
  }
}

/** A new task starts in the first category of the user's own areas (e.g. Work, Classes & study). */
export function defaultCategory(answers: Answers): string {
  if (!answers.focus?.length) return DEFAULT_CATEGORY;
  return splitCategories(focusGroups(answers)).mine[0]?.id ?? DEFAULT_CATEGORY;
}
