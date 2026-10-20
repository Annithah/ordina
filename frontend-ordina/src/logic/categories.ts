/**
 * Category rules. No app imports, so the unit tests run with plain Node (`npm test`).
 *
 * Default categories have fixed ids, so the same default on two phones is the same record when
 * they sync. Names shown for defaults come from translations until the user renames them.
 */

export const CATEGORY_NAME_MAX = 30;
export const OTHER_CATEGORY_ID = 'cat-other';

export const CATEGORY_ICONS = [
  'briefcase-outline',
  'school-outline',
  'person-outline',
  'fitness-outline',
  'people-outline',
  'wallet-outline',
  'cart-outline',
  'pricetag-outline',
  'home-outline',
  'heart-outline',
  'book-outline',
  'car-outline',
  'restaurant-outline',
  'musical-notes-outline',
  'airplane-outline',
  'leaf-outline',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_COLORS = [
  '#5C4DF2', '#3B82F6', '#F59E0B', '#22C55E', '#EC4899', '#14B8A6', '#06B6D4', '#64748B',
  '#EF4444', '#8B5CF6', '#F97316', '#84CC16',
] as const;

export type Category = {
  id: string;
  /** Empty for an untouched default: the translated default name is shown instead. */
  name: string;
  color: string;
  icon: CategoryIcon;
  position: number;
  /** Translation key of a default category (e.g. "work"); null for the user's own. */
  defaultKey: string | null;
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-work', defaultKey: 'work', name: '', color: '#5C4DF2', icon: 'briefcase-outline', position: 0 },
  { id: 'cat-study', defaultKey: 'study', name: '', color: '#3B82F6', icon: 'school-outline', position: 1 },
  { id: 'cat-personal', defaultKey: 'personal', name: '', color: '#F59E0B', icon: 'person-outline', position: 2 },
  { id: 'cat-health', defaultKey: 'health', name: '', color: '#22C55E', icon: 'fitness-outline', position: 3 },
  { id: 'cat-family', defaultKey: 'family', name: '', color: '#EC4899', icon: 'people-outline', position: 4 },
  { id: 'cat-finance', defaultKey: 'finance', name: '', color: '#14B8A6', icon: 'wallet-outline', position: 5 },
  { id: 'cat-errands', defaultKey: 'errands', name: '', color: '#06B6D4', icon: 'cart-outline', position: 6 },
  { id: OTHER_CATEGORY_ID, defaultKey: 'other', name: '', color: '#64748B', icon: 'pricetag-outline', position: 7 },
];

/** Category slugs from version 1 -> V2 default category ids. */
export const LEGACY_CATEGORY_IDS: Record<string, string> = {
  work: 'cat-work',
  personal: 'cat-personal',
  health: 'cat-health',
  learning: 'cat-study',
  design: 'cat-personal',
  database: 'cat-errands',
};

export function legacyCategoryId(slug: string | null | undefined) {
  return (slug && LEGACY_CATEGORY_IDS[slug.toLowerCase()]) || OTHER_CATEGORY_ID;
}

export type CategoryNameError = 'empty' | 'tooLong' | 'duplicate';

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/**
 * Checks a category name: 1-30 characters after trimming, and unique (ignoring case and extra
 * spaces) among `others`, which are the names as displayed (translated defaults included).
 */
export function validateCategoryName(name: string, others: string[]): CategoryNameError | null {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return 'empty';
  if (trimmed.length > CATEGORY_NAME_MAX) return 'tooLong';
  if (others.some((other) => normalize(other) === normalize(trimmed))) return 'duplicate';
  return null;
}

/** Where tasks go when a category is deleted: the chosen one, else "Other", else the first left. */
export function fallbackCategoryId(categories: Pick<Category, 'id'>[], deletedId: string, chosenId?: string | null) {
  const left = categories.filter((category) => category.id !== deletedId);
  if (chosenId && left.some((category) => category.id === chosenId)) return chosenId;
  if (left.some((category) => category.id === OTHER_CATEGORY_ID)) return OTHER_CATEGORY_ID;
  return left[0]?.id ?? null;
}

/** Moves the category at `from` to `to` and renumbers positions 0..n-1. */
export function reorder<T extends { position: number }>(items: T[], from: number, to: number): T[] {
  const list = [...items].sort((a, b) => a.position - b.position);
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list;
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  return list.map((item, position) => ({ ...item, position }));
}

// English, French and Kinyarwanda words that point to a default category.
const KEYWORDS: [string, RegExp][] = [
  ['cat-health', /\b(gym|workout|work out|exercise|run|running|jog|jogging|walk|yoga|swim|swimming|football|soccer|basketball|training|stretch|doctor|dentist|hospital|clinic|medicine|meds|pharmacy|therapy|meditate|meditation|sleep|diet|salle de sport|sport|courir|médecin|medecin|hôpital|hopital|pharmacie|imyitozo|siporo|kwiruka|muganga|ibitaro|imiti)\b/i],
  ['cat-study', /\b(study|studying|revise|revision|homework|assignment|exam|exams|test|quiz|lecture|class|course|lesson|read|reading|research|thesis|essay|learn|learning|practice|school|university|tutorial|étudier|etudier|réviser|reviser|devoirs|examen|cours|leçon|lecon|kwiga|amasomo|ikizamini|isomo|gusoma)\b/i],
  ['cat-work', /\b(meeting|meet with|standup|stand-up|client|clients|report|presentation|email|emails|deadline|project|office|work|boss|manager|team|interview|call with|proposal|invoice client|deploy|code review|sprint|réunion|reunion|rapport|bureau|travail|projet|client|inama|akazi|raporo|umushinga)\b/i],
  ['cat-finance', /\b(pay|payment|bill|bills|rent|bank|budget|tax|taxes|invoice|salary|loan|savings|save money|insurance|transfer money|mobile money|momo|payer|facture|loyer|banque|impôts|impots|assurance|kwishyura|banki|amafaranga|inguzanyo|ubwishingizi)\b/i],
  ['cat-family', /\b(mom|mum|mother|dad|father|parents|kids|children|son|daughter|wife|husband|family|grandma|grandpa|brother|sister|baby|school pickup|pick up the kids|maman|papa|enfants|famille|frère|frere|soeur|sœur|mama|data|abana|umuryango|murumuna|mukuru|bashiki|musaza)\b/i],
  ['cat-errands', /\b(buy|shopping|shop|groceries|grocery|supermarket|market|pick up|pickup|drop off|post office|laundry|repair|fix the|car wash|fuel|petrol|refill|order|collect|acheter|courses|marché|marche|pressing|réparer|reparer|guhaha|isoko|kugura|gusana|kumesa)\b/i],
  ['cat-personal', /\b(journal|hobby|haircut|salon|clean|cleaning|tidy|cook|cooking|movie|read a book|relax|me time|birthday|party|friends|friend|church|pray|prayer|mass|personal|nettoyer|cuisiner|anniversaire|amis|église|eglise|prière|priere|gusukura|guteka|isabukuru|inshuti|gusenga|kiliziya|urusengero)\b/i],
];

/**
 * Suggests a default category for a task title, or null when nothing matches. Only suggests
 * categories that still exist (`available` ids); the user can always change it.
 */
export function suggestCategoryId(title: string, available?: string[]): string | null {
  const text = ` ${title.toLowerCase()} `;
  for (const [id, pattern] of KEYWORDS) {
    if (available && !available.includes(id)) continue;
    if (pattern.test(text)) return id;
  }
  return null;
}
