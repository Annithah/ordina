/**
 * Task categories, grouped the way people think about their lives.
 * Labels are translated (categories.items.<id> / categories.groups.<id>); ids are stored on tasks.
 */
import type Ionicons from '@expo/vector-icons/Ionicons';

type IconName = keyof typeof Ionicons.glyphMap;

export type CategoryGroupId = 'work' | 'education' | 'health' | 'home' | 'finance' | 'business' | 'social' | 'creative';

export type CategoryInfo = { id: string; group: CategoryGroupId; icon: IconName; color: string };

export const CATEGORY_GROUPS: { id: CategoryGroupId; icon: IconName; color: string }[] = [
  { id: 'work', icon: 'briefcase-outline', color: '#5C4DF2' },
  { id: 'education', icon: 'school-outline', color: '#3B82F6' },
  { id: 'health', icon: 'fitness-outline', color: '#22C55E' },
  { id: 'home', icon: 'home-outline', color: '#F59E0B' },
  { id: 'finance', icon: 'wallet-outline', color: '#0EA5A4' },
  { id: 'business', icon: 'rocket-outline', color: '#8B5CF6' },
  { id: 'social', icon: 'people-outline', color: '#F43F5E' },
  { id: 'creative', icon: 'color-palette-outline', color: '#EC4899' },
];

const GROUP_COLOR = Object.fromEntries(CATEGORY_GROUPS.map((group) => [group.id, group.color])) as Record<CategoryGroupId, string>;

const item = (id: string, group: CategoryGroupId, icon: IconName): CategoryInfo => ({ id, group, icon, color: GROUP_COLOR[group] });

export const CATEGORIES: CategoryInfo[] = [
  item('work', 'work', 'briefcase-outline'),
  item('meetings', 'work', 'people-circle-outline'),
  item('projects', 'work', 'folder-open-outline'),
  item('admin', 'work', 'mail-outline'),
  item('career', 'work', 'trending-up-outline'),
  item('study', 'education', 'school-outline'),
  item('homework', 'education', 'create-outline'),
  item('exams', 'education', 'document-text-outline'),
  item('reading', 'education', 'book-outline'),
  item('learning', 'education', 'laptop-outline'),
  item('research', 'education', 'search-outline'),
  item('fitness', 'health', 'barbell-outline'),
  item('health', 'health', 'medkit-outline'),
  item('nutrition', 'health', 'nutrition-outline'),
  item('mindfulness', 'health', 'leaf-outline'),
  item('personal', 'home', 'person-outline'),
  item('family', 'home', 'heart-outline'),
  item('kids', 'home', 'happy-outline'),
  item('chores', 'home', 'home-outline'),
  item('errands', 'home', 'cart-outline'),
  item('bills', 'finance', 'receipt-outline'),
  item('budget', 'finance', 'wallet-outline'),
  item('business', 'business', 'rocket-outline'),
  item('sales', 'business', 'cash-outline'),
  item('marketing', 'business', 'megaphone-outline'),
  item('friends', 'social', 'chatbubbles-outline'),
  item('events', 'social', 'gift-outline'),
  item('faith', 'social', 'sparkles-outline'),
  item('volunteering', 'social', 'hand-left-outline'),
  item('creative', 'creative', 'color-palette-outline'),
  item('hobbies', 'creative', 'game-controller-outline'),
  item('travel', 'creative', 'airplane-outline'),
];

export const CATEGORY_IDS = new Set(CATEGORIES.map((category) => category.id));

/** Ids used by version 1 of the app, still found on older tasks. */
const LEGACY: Record<string, string> = { design: 'creative', database: 'errands' };

export const DEFAULT_CATEGORY = 'personal';

/** A known category id (old version 1 ids are renamed), or null when the value is not a category. */
export function knownCategory(value: unknown): string | null {
  const id = String(value ?? '').trim().toLowerCase();
  const mapped = LEGACY[id] ?? id;
  return CATEGORY_IDS.has(mapped) ? mapped : null;
}

/** Any stored value -> a category id; unknown or empty values become Personal. */
export function normalizeCategory(value: unknown): string {
  return knownCategory(value) ?? DEFAULT_CATEGORY;
}

export function categoryInfo(id: unknown): CategoryInfo {
  const normalized = normalizeCategory(id);
  return CATEGORIES.find((category) => category.id === normalized)!;
}

/** Onboarding "What would you like help with?" answer -> the category group it stands for. */
const FOCUS_TO_GROUP: Record<string, CategoryGroupId> = {
  work: 'work',
  study: 'education',
  health: 'health',
  family: 'home',
  business: 'business',
  finance: 'finance',
  social: 'social',
  creative: 'creative',
};

/** The groups the user said they plan for, in catalogue order. Empty answers mean "all". */
export function focusGroups(answers: Record<string, string[] | undefined>): CategoryGroupId[] {
  const chosen = new Set((answers.focus ?? []).map((focus) => FOCUS_TO_GROUP[focus]).filter(Boolean));
  return CATEGORY_GROUPS.map((group) => group.id).filter((id) => chosen.size === 0 || chosen.has(id));
}

/** The user's own categories first (from their focus areas), then all the others. */
export function splitCategories(groups: CategoryGroupId[]) {
  const mine = new Set(groups);
  const allGroups = mine.size === CATEGORY_GROUPS.length;
  return {
    mine: allGroups ? CATEGORIES : CATEGORIES.filter((category) => mine.has(category.group)),
    others: allGroups ? [] : CATEGORIES.filter((category) => !mine.has(category.group)),
  };
}
