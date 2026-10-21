/** Search, category filter chips and grouping by category (Home and Tasks). */
import { categoryRegistry, normalizeCategory, rootCategory } from './categories.ts';
import { buildTree } from './category-tree.ts';

type FilterableTask = { title: string; description?: string; category: string; completed: boolean };

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Position of each category in the user's order (parents, each followed by its subcategories). */
function catalogOrder() {
  const order = new Map<string, number>();
  for (const parent of buildTree(categoryRegistry(), { includeArchived: true })) {
    order.set(parent.id, order.size);
    for (const child of parent.children) order.set(child.id, order.size);
  }
  return order;
}

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

/** Tasks in the category; a top-level category includes its subcategories. */
export function filterByCategory<T extends FilterableTask>(tasks: T[], category: string | null): T[] {
  if (!category) return tasks;
  return tasks.filter((task) => {
    const id = normalizeCategory(task.category);
    return id === category || rootCategory(id) === category;
  });
}

/** The top-level categories this user's tasks actually use, most used first: these are the filter chips. */
export function categoryCounts(tasks: FilterableTask[]): { id: string; count: number }[] {
  const order = catalogOrder();
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const id = rootCategory(task.category);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

/**
 * Tasks grouped by top-level category in the user's order, with pending/done counts
 * ("Study · 3 pending · 2 done"); inside a group the given order is kept.
 */
export function groupByCategory<T extends FilterableTask>(tasks: T[]): { category: string; tasks: T[]; pending: number; done: number }[] {
  const order = catalogOrder();
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const id = rootCategory(task.category);
    groups.set(id, [...(groups.get(id) ?? []), task]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    .map(([category, items]) => ({
      category,
      tasks: items,
      pending: items.filter((task) => !task.completed).length,
      done: items.filter((task) => task.completed).length,
    }));
}
