/** Home screen search, category filter chips and grouping by category. */
import { CATEGORIES, normalizeCategory } from './categories.ts';

type FilterableTask = { title: string; description?: string; category: string; completed: boolean };

const CATALOG_ORDER = new Map(CATEGORIES.map((category, index) => [category.id, index]));

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Tasks whose title, description or category name contain every word of the query
 * (case and accents ignored), e.g. "exam math" or "réunion".
 */
export function searchTasks<T extends FilterableTask>(tasks: T[], query: string, categoryLabel: (id: string) => string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return tasks;
  return tasks.filter((task) => {
    const haystack = fold(`${task.title} ${task.description ?? ''} ${categoryLabel(normalizeCategory(task.category))}`);
    return words.every((word) => haystack.includes(word));
  });
}

export function filterByCategory<T extends FilterableTask>(tasks: T[], category: string | null): T[] {
  return category ? tasks.filter((task) => normalizeCategory(task.category) === category) : tasks;
}

/** The categories this user's tasks actually use, most used first: these are the filter chips. */
export function categoryCounts(tasks: FilterableTask[]): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const id = normalizeCategory(task.category);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || (CATALOG_ORDER.get(a.id) ?? 0) - (CATALOG_ORDER.get(b.id) ?? 0));
}

/** Tasks grouped by category in catalogue order; inside a group the given order is kept. */
export function groupByCategory<T extends FilterableTask>(tasks: T[]): { category: string; tasks: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const id = normalizeCategory(task.category);
    groups.set(id, [...(groups.get(id) ?? []), task]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (CATALOG_ORDER.get(a) ?? 0) - (CATALOG_ORDER.get(b) ?? 0))
    .map(([category, items]) => ({ category, tasks: items }));
}
