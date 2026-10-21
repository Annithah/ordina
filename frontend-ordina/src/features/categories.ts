/**
 * The categories the app is using right now. The categories store (SQLite) keeps this registry
 * up to date, so code outside React (filters, validation, ORDINA AI) can look categories up.
 * Before the database has loaded, the default categories are used.
 */
import {
  OTHER_ID,
  LEGACY_CATEGORY_MAP,
  defaultRecords,
  isCategoryId,
  rootOf,
  type CategoryRecord,
} from './category-tree.ts';

export { OTHER_ID } from './category-tree.ts';

export type CategoryInfo = {
  id: string;
  /** User's own name; empty means the translated default name (categories.defaults.<id>). */
  name: string;
  color: string;
  icon: string;
  parentId: string | null;
  isDefault: boolean;
  isArchived: boolean;
};

let registry: CategoryRecord[] = defaultRecords('');
let byId = new Map(registry.map((record) => [record.id, record]));

export function setCategoryRegistry(records: CategoryRecord[]) {
  registry = records;
  byId = new Map(records.map((record) => [record.id, record]));
}

export function categoryRegistry() {
  return registry;
}

export const DEFAULT_CATEGORY = OTHER_ID;

/** An existing (not deleted) category id for any value, old ids renamed; null when there is none. */
export function knownCategory(value: unknown): string | null {
  const id = String(value ?? '').trim().toLowerCase();
  if (!id) return null;
  const live = (candidate: string) => {
    const record = byId.get(candidate);
    return record && !record.deletedAt ? candidate : null;
  };
  return live(id) ?? (LEGACY_CATEGORY_MAP[id] ? live(LEGACY_CATEGORY_MAP[id]) : null);
}

/**
 * The category id stored on a task. Ids that look valid are kept even when not (yet) in the
 * registry, so a user's own category never turns into Other while the database is loading.
 */
export function normalizeCategory(value: unknown): string {
  const known = knownCategory(value);
  if (known) return known;
  const id = String(value ?? '').trim().toLowerCase();
  return isCategoryId(id) && !LEGACY_CATEGORY_MAP[id] ? id : OTHER_ID;
}

export function categoryInfo(id: unknown): CategoryInfo {
  const record = byId.get(normalizeCategory(id)) ?? byId.get(OTHER_ID) ?? defaultRecords('').find((item) => item.id === OTHER_ID)!;
  return {
    id: record.id,
    name: record.name,
    color: record.color,
    icon: record.icon,
    parentId: record.parentId,
    isDefault: record.isDefault,
    isArchived: record.isArchived,
  };
}

/** The top-level category of a task's category (Exams -> Study). */
export function rootCategory(id: unknown): string {
  return rootOf(normalizeCategory(id), registry);
}

/** Onboarding "What would you like help with?" answers -> the default categories they stand for. */
const FOCUS_TO_CATEGORIES: Record<string, string[]> = {
  work: ['work'],
  study: ['study'],
  health: ['health'],
  family: ['family'],
  business: ['work'],
  finance: ['finance'],
  social: ['family', 'spiritual'],
  creative: ['personal'],
};

/** The categories the user said they plan for, in catalogue order (empty when they skipped). */
export function focusCategories(answers: Record<string, string[] | undefined>): string[] {
  const chosen = new Set((answers.focus ?? []).flatMap((focus) => FOCUS_TO_CATEGORIES[focus] ?? []));
  return defaultRecords('').filter((record) => !record.parentId && chosen.has(record.id)).map((record) => record.id);
}
