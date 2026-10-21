/**
 * ORDINA categories: user-editable, one level of subcategories. This file is the pure logic
 * (no React Native, no database) so it can be unit tested with `node --test`; the SQLite side
 * lives in services/local-categories.ts.
 */

export type CategoryRecord = {
  id: string;
  /** Empty for a default category whose name was never changed: its name is translated. */
  name: string;
  color: string;
  icon: string;
  parentId: string | null;
  sortOrder: number;
  isArchived: boolean;
  isDefault: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CategoryNode = CategoryRecord & { children: CategoryRecord[] };

/** The fallback category: tasks without one belong here. It can be renamed or archived, not deleted. */
export const OTHER_ID = 'other';

export const MAX_NAME_LENGTH = 30;

/** Accessible colours (white text and icons stay readable on each). */
export const PALETTE = [
  '#5C4DF2', '#3B82F6', '#0EA5E9', '#06B6D4', '#0EA5A4', '#22C55E', '#65A30D', '#F59E0B',
  '#EA580C', '#EF4444', '#F43F5E', '#EC4899', '#A855F7', '#8B5CF6', '#64748B', '#78716C',
];

/** Curated icons with search words (English and French). */
export const ICONS: { name: string; words: string }[] = [
  { name: 'briefcase-outline', words: 'work job office travail' },
  { name: 'people-circle-outline', words: 'meeting team réunion' },
  { name: 'folder-open-outline', words: 'project folder projet' },
  { name: 'mail-outline', words: 'email mail courriel' },
  { name: 'school-outline', words: 'study school école' },
  { name: 'easel-outline', words: 'class lesson cours' },
  { name: 'create-outline', words: 'assignment homework write devoir' },
  { name: 'document-text-outline', words: 'exam document examen' },
  { name: 'book-outline', words: 'read book livre' },
  { name: 'person-outline', words: 'personal me personnel' },
  { name: 'cart-outline', words: 'errands shopping courses' },
  { name: 'home-outline', words: 'home house maison' },
  { name: 'game-controller-outline', words: 'hobby game jeu loisir' },
  { name: 'fitness-outline', words: 'health fitness santé' },
  { name: 'barbell-outline', words: 'exercise gym sport' },
  { name: 'medkit-outline', words: 'medical doctor médecin' },
  { name: 'nutrition-outline', words: 'food nutrition repas' },
  { name: 'heart-outline', words: 'love family heart famille' },
  { name: 'people-outline', words: 'friends family amis' },
  { name: 'call-outline', words: 'call phone appel' },
  { name: 'gift-outline', words: 'event birthday gift fête' },
  { name: 'wallet-outline', words: 'finance money argent' },
  { name: 'receipt-outline', words: 'bills invoice facture' },
  { name: 'trending-up-outline', words: 'savings growth épargne' },
  { name: 'bag-handle-outline', words: 'shopping bag achats' },
  { name: 'sparkles-outline', words: 'spiritual faith foi' },
  { name: 'star-outline', words: 'worship favourite church mosque' },
  { name: 'flame-outline', words: 'prayer candle prière' },
  { name: 'airplane-outline', words: 'travel trip voyage' },
  { name: 'car-outline', words: 'car vehicle voiture' },
  { name: 'code-slash-outline', words: 'code tech programming' },
  { name: 'laptop-outline', words: 'computer laptop ordinateur' },
  { name: 'musical-notes-outline', words: 'music musique' },
  { name: 'color-palette-outline', words: 'art creative design' },
  { name: 'camera-outline', words: 'photo camera' },
  { name: 'leaf-outline', words: 'nature calm garden jardin' },
  { name: 'paw-outline', words: 'pet dog cat animal' },
  { name: 'rocket-outline', words: 'business startup entreprise' },
  { name: 'megaphone-outline', words: 'marketing announce' },
  { name: 'happy-outline', words: 'kids children enfants' },
  { name: 'moon-outline', words: 'sleep night sommeil' },
  { name: 'ellipsis-horizontal-circle-outline', words: 'other misc autre' },
];

type DefaultDef = { id: string; color: string; icon: string; children: { id: string; icon: string }[] };

/** Created on first launch. Names are translated (categories.defaults.<id>) until the user renames them. */
export const DEFAULT_CATEGORIES: DefaultDef[] = [
  { id: 'work', color: '#5C4DF2', icon: 'briefcase-outline', children: [
    { id: 'meetings', icon: 'people-circle-outline' },
    { id: 'projects', icon: 'folder-open-outline' },
    { id: 'emails', icon: 'mail-outline' },
  ] },
  { id: 'study', color: '#3B82F6', icon: 'school-outline', children: [
    { id: 'classes', icon: 'easel-outline' },
    { id: 'assignments', icon: 'create-outline' },
    { id: 'exams', icon: 'document-text-outline' },
    { id: 'reading', icon: 'book-outline' },
  ] },
  { id: 'personal', color: '#F59E0B', icon: 'person-outline', children: [
    { id: 'errands', icon: 'cart-outline' },
    { id: 'home', icon: 'home-outline' },
    { id: 'hobbies', icon: 'game-controller-outline' },
  ] },
  { id: 'health', color: '#22C55E', icon: 'fitness-outline', children: [
    { id: 'exercise', icon: 'barbell-outline' },
    { id: 'medical', icon: 'medkit-outline' },
    { id: 'nutrition', icon: 'nutrition-outline' },
  ] },
  { id: 'family', color: '#F43F5E', icon: 'people-outline', children: [
    { id: 'calls', icon: 'call-outline' },
    { id: 'events', icon: 'gift-outline' },
  ] },
  { id: 'finance', color: '#0EA5A4', icon: 'wallet-outline', children: [
    { id: 'bills', icon: 'receipt-outline' },
    { id: 'savings', icon: 'trending-up-outline' },
    { id: 'shopping', icon: 'bag-handle-outline' },
  ] },
  { id: 'spiritual', color: '#8B5CF6', icon: 'sparkles-outline', children: [
    { id: 'prayer', icon: 'flame-outline' },
    { id: 'worship', icon: 'star-outline' },
  ] },
  { id: OTHER_ID, color: '#64748B', icon: 'ellipsis-horizontal-circle-outline', children: [] },
];

/** The default records, in order (parents followed by their subcategories). */
export function defaultRecords(now = new Date().toISOString()): CategoryRecord[] {
  const records: CategoryRecord[] = [];
  DEFAULT_CATEGORIES.forEach((parent, index) => {
    const base = { name: '', isArchived: false, isDefault: true, isPinned: false, createdAt: now, updatedAt: now, deletedAt: null };
    records.push({ ...base, id: parent.id, color: parent.color, icon: parent.icon, parentId: null, sortOrder: index });
    parent.children.forEach((child, childIndex) => {
      records.push({ ...base, id: child.id, color: parent.color, icon: child.icon, parentId: parent.id, sortOrder: childIndex });
    });
  });
  return records;
}

export const DEFAULT_IDS = new Set(defaultRecords('').map((record) => record.id));

/**
 * Category ids used by ORDINA before version 1.2 (a fixed list) -> the new default categories.
 * Ids that still exist ("work", "exams", "family"...) keep their tasks where they are.
 */
export const LEGACY_CATEGORY_MAP: Record<string, string> = {
  admin: 'emails',
  career: 'work',
  business: 'work',
  sales: 'work',
  marketing: 'work',
  homework: 'assignments',
  learning: 'study',
  research: 'study',
  fitness: 'exercise',
  health: 'medical',
  mindfulness: 'health',
  kids: 'family',
  friends: 'family',
  chores: 'home',
  budget: 'finance',
  faith: 'spiritual',
  volunteering: 'personal',
  travel: 'personal',
  creative: 'hobbies',
  design: 'hobbies',
  database: 'errands',
};

/** The ids the migration rewrites. "health" moves to Medical because it used to mean "Doctor & medicine". */
export function migrateCategoryId(value: unknown): string {
  const id = String(value ?? '').trim().toLowerCase();
  if (!id) return OTHER_ID;
  if (LEGACY_CATEGORY_MAP[id]) return LEGACY_CATEGORY_MAP[id];
  return DEFAULT_IDS.has(id) ? id : OTHER_ID;
}

/** A category id as stored on a task. Ids are lowercase words or generated ids. */
export function isCategoryId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

export type NameError = 'empty' | 'tooLong' | 'duplicate';

/** 1-30 characters, unique (ignoring case and accents) among the categories with the same parent. */
export function validateCategoryName(
  name: string,
  parentId: string | null,
  all: CategoryRecord[],
  nameOf: (record: CategoryRecord) => string,
  excludeId?: string,
): NameError | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > MAX_NAME_LENGTH) return 'tooLong';
  const key = fold(trimmed);
  const clash = all.some((record) => (
    !record.deletedAt
    && record.id !== excludeId
    && (record.parentId ?? null) === (parentId ?? null)
    && fold(nameOf(record)) === key
  ));
  return clash ? 'duplicate' : null;
}

const bySort = (a: CategoryRecord, b: CategoryRecord) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt);

/** Parents with their subcategories, in the user's order. Archived ones only when asked. */
export function buildTree(all: CategoryRecord[], options: { includeArchived?: boolean } = {}): CategoryNode[] {
  const live = all.filter((record) => !record.deletedAt && (options.includeArchived || !record.isArchived));
  const ids = new Set(live.map((record) => record.id));
  return live
    // A subcategory whose parent is gone shows at the top level instead of disappearing.
    .filter((record) => !record.parentId || !ids.has(record.parentId))
    .sort(bySort)
    .map((parent) => ({ ...parent, children: live.filter((record) => record.parentId === parent.id).sort(bySort) }));
}

/** The category and its subcategories. */
export function withChildren(id: string, all: CategoryRecord[]): string[] {
  return [id, ...all.filter((record) => record.parentId === id && !record.deletedAt).map((record) => record.id)];
}

/** The top-level category a task's category belongs to (itself when it has no parent). */
export function rootOf(id: string, all: CategoryRecord[]): string {
  const record = all.find((item) => item.id === id);
  if (!record?.parentId) return record ? record.id : OTHER_ID;
  return all.some((item) => item.id === record.parentId && !item.deletedAt) ? record.parentId : record.id;
}

/** Tasks in any of the chosen categories; choosing a parent includes all of its subcategories. */
export function filterTasksByCategories<T extends { category: string }>(tasks: T[], chosen: string[], all: CategoryRecord[]): T[] {
  if (!chosen.length) return tasks;
  const ids = new Set(chosen.flatMap((id) => withChildren(id, all)));
  return tasks.filter((task) => ids.has(task.category));
}

export type DeletePlan = {
  /** Categories that disappear (the category and its subcategories). */
  removeIds: string[];
  /** Where their tasks go, or null when the tasks are deleted too. */
  moveTasksTo: string | null;
};

/**
 * What deleting a category does. Tasks are never dropped silently: they move to `moveTo`,
 * or are deleted only when the user chose `deleteTasks`.
 */
export function planDelete(id: string, all: CategoryRecord[], choice: { moveTo: string } | { deleteTasks: true }): DeletePlan {
  if (id === OTHER_ID) throw new Error('The Other category cannot be deleted.');
  const removeIds = withChildren(id, all);
  if ('deleteTasks' in choice) return { removeIds, moveTasksTo: null };
  if (removeIds.includes(choice.moveTo)) throw new Error('Choose a category that is not being deleted.');
  if (!all.some((record) => record.id === choice.moveTo && !record.deletedAt)) throw new Error('That category does not exist.');
  return { removeIds, moveTasksTo: choice.moveTo };
}

export type MergePlan = {
  /** Tasks in these categories move to the target. */
  moveTaskIds: string[];
  target: string;
  /** Subcategories of the source that move under the target (when the target is a top-level category). */
  reparentIds: string[];
  removeIds: string[];
};

/** Merges `sourceId` into `targetId`: its tasks move over, then it disappears. */
export function planMerge(sourceId: string, targetId: string, all: CategoryRecord[]): MergePlan {
  if (sourceId === targetId) throw new Error('Choose two different categories.');
  if (sourceId === OTHER_ID) throw new Error('The Other category cannot be merged away.');
  const target = all.find((record) => record.id === targetId && !record.deletedAt);
  if (!target) throw new Error('That category does not exist.');
  if (target.parentId === sourceId) throw new Error('A category cannot be merged into its own subcategory.');
  const children = withChildren(sourceId, all).slice(1);
  // One level of subcategories: under a top-level target the source's subcategories survive.
  const reparentIds = target.parentId ? [] : children;
  return {
    moveTaskIds: target.parentId ? [sourceId, ...children] : [sourceId],
    target: targetId,
    reparentIds,
    removeIds: target.parentId ? [sourceId, ...children] : [sourceId],
  };
}

/** New sort orders after moving one item from `from` to `to` (drag and drop) within a list. */
export function reorder(ids: string[], from: number, to: number): { id: string; sortOrder: number }[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next.map((id, sortOrder) => ({ id, sortOrder }));
}

/** Picker order: pinned first, then recently used, then everything else in tree order. */
export function pickerOrder(all: CategoryRecord[], recentIds: string[]): { pinned: CategoryRecord[]; recent: CategoryRecord[] } {
  const live = all.filter((record) => !record.deletedAt && !record.isArchived);
  const parentArchived = new Set(all.filter((record) => record.isArchived || record.deletedAt).map((record) => record.id));
  const usable = live.filter((record) => !record.parentId || !parentArchived.has(record.parentId));
  const pinned = usable.filter((record) => record.isPinned).sort(bySort);
  const pinnedIds = new Set(pinned.map((record) => record.id));
  const recent: CategoryRecord[] = [];
  for (const id of recentIds) {
    const record = usable.find((item) => item.id === id);
    if (record && !pinnedIds.has(id) && !recent.includes(record)) recent.push(record);
    if (recent.length >= 5) break;
  }
  return { pinned, recent };
}

// ---------------------------------------------------------------------------------------------
// Smart suggestions

export function fold(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Words that point to a default category, checked in order (specific before general), in
 * English, Kinyarwanda and French. A word matches at the start of a word: "exam" finds "exams".
 */
const KEYWORDS: [string, string[]][] = [
  ['exams', ['exam', 'test ', 'quiz', 'midterm', 'final exam', 'ikizamini', 'ibizamini', 'examen', 'partiel', 'contrôle']],
  ['assignments', ['assignment', 'homework', 'coursework', 'essay', 'umukoro', 'imikoro', 'devoir', 'dissertation']],
  ['medical', ['doctor', 'dentist', 'hospital', 'clinic', 'medicine', 'medication', 'pill', 'pharmacy', 'checkup', 'vaccin', 'muganga', 'ibitaro', 'imiti', 'kwa muganga', 'médecin', 'hôpital', 'pharmacie', 'rendez-vous médical']],
  ['bills', ['bill', 'rent', 'electricity', 'water bill', 'invoice', 'pay ', 'payment', 'subscription', 'fagitire', 'kwishyura', 'ubukode', 'umuriro', 'facture', 'loyer', 'payer', 'abonnement']],
  ['savings', ['save money', 'saving', 'deposit', 'kuzigama', 'ikimina', 'épargne', 'économiser']],
  ['shopping', ['buy', 'shop', 'shopping', 'purchase', 'order online', 'kugura', 'guhaha', 'acheter', 'achats']],
  ['meetings', ['meeting', 'meet with', 'standup', 'stand-up', 'sync', 'interview', 'inama', 'guhura', 'réunion', 'entretien', 'rendez-vous']],
  ['emails', ['email', 'e-mail', 'mail ', 'reply to', 'inbox', 'imeyili', 'courriel', 'répondre']],
  ['projects', ['project', 'proposal', 'deadline', 'umushinga', 'imishinga', 'projet']],
  ['classes', ['class', 'lecture', 'lesson', 'tutorial', 'course', 'isomo', 'amasomo', 'ishuri', 'cours', 'leçon']],
  ['reading', ['read ', 'reading', 'books', 'chapter', 'novel', 'gusoma', 'igitabo', 'ibitabo', 'lire', 'livre', 'chapitre']],
  ['exercise', ['gym', 'workout', 'exercise', 'run ', 'running', 'jog', 'yoga', 'walk', 'football', 'basketball', 'swim', 'sport', 'imyitozo', 'siporo', 'kwiruka', 'gutembera', 'courir', 'musculation', 'entraînement', 'marche']],
  ['nutrition', ['breakfast', 'lunch', 'dinner', 'meal', 'diet', 'drink water', 'cook', 'recipe', 'ifunguro', 'amafunguro', 'ibiryo', 'guteka', 'petit-déjeuner', 'déjeuner', 'dîner', 'repas', 'cuisiner']],
  ['prayer', ['pray', 'prayer', 'bible', 'quran', 'devotion', 'gusenga', 'isengesho', 'amasengesho', 'bibiliya', 'prier', 'prière']],
  ['worship', ['church', 'mosque', 'mass ', 'service at', 'worship', 'choir', 'urusengero', 'kiliziya', 'umusigiti', 'misa', 'église', 'mosquée', 'messe', 'culte']],
  ['events', ['birthday', 'wedding', 'party', 'celebration', 'anniversary', 'concert', 'ceremony', 'graduation', 'ubukwe', 'ibirori', 'isabukuru', 'anniversaire', 'mariage', 'fête', 'cérémonie']],
  ['calls', ['call', 'phone ', 'ring ', 'facetime', 'video call', 'guhamagara', 'hamagara', 'appeler', 'téléphoner', 'appel']],
  ['work', ['bug', 'deploy', 'code ', 'coding', 'programming']],
  ['home', ['clean', 'laundry', 'wash', 'dishes', 'vacuum', 'tidy', 'iron', 'fix', 'repair', 'gukora isuku', 'kumesa', 'koza', 'isuku', 'ménage', 'lessive', 'nettoyer', 'réparer', 'vaisselle']],
  ['errands', ['pick up', 'drop off', 'post office', 'bank', 'market', 'supermarket', 'grocer', 'collect', 'isoko', 'kuri banki', 'marché', 'banque', 'poste', 'récupérer']],
  ['hobbies', ['guitar', 'piano', 'paint', 'draw', 'movie', 'game', 'photo', 'garden', 'hobby', 'gucuranga', 'gushushanya', 'film', 'jeu', 'dessiner', 'peindre', 'jardin']],
  ['work', ['work', 'office', 'report', 'client', 'boss', 'colleague', 'shift', 'akazi', 'ku kazi', 'raporo', 'travail', 'bureau', 'rapport', 'collègue']],
  ['study', ['study', 'revise', 'revision', 'research', 'thesis', 'school', 'university', 'kwiga', 'gusubiramo', 'kaminuza', 'étudier', 'réviser', 'école', 'université']],
  ['family', ['mom', 'mum', 'dad', 'mother', 'father', 'parents', 'family', 'kids', 'children', 'grandma', 'brother', 'sister', 'wife', 'husband', 'friend', 'mama', 'papa', 'umuryango', 'abana', 'inshuti', 'maman', 'famille', 'enfants', 'ami', 'amie']],
  ['finance', ['budget', 'money', 'loan', 'tax', 'invest', 'mobile money', 'momo', 'amafaranga', 'inguzanyo', 'umusoro', 'argent', 'prêt', 'impôt']],
  ['health', ['sleep', 'meditat', 'rest day', 'therapy', 'gusinzira', 'kuruhuka', 'dormir', 'méditer', 'santé']],
  ['spiritual', ['faith', 'spiritual', 'fasting', 'kwiyiriza', 'ukwemera', 'jeûne', 'foi']],
  ['personal', ['haircut', 'salon', 'travel', 'trip', 'hotel', 'flight', 'booking', 'passport', 'umuganda', 'personal', 'voyage', 'coiffeur']],
];

const MATCHERS: [string, RegExp][] = KEYWORDS.map(([id, words]) => {
  const escaped = words.map((word) => fold(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return [id, new RegExp(`(^|[^a-z0-9])(${escaped.join('|')})`)];
});

/** ORDINA AI plan task types -> the closest default category, when the words give no hint. */
const TYPE_CATEGORY: Record<string, string> = {
  exercise: 'exercise',
  study: 'study',
  work: 'work',
  meeting: 'meetings',
  call: 'calls',
  errand: 'errands',
  chores: 'home',
  meal: 'nutrition',
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'tomorrow', 'today', 'tonight', 'morning', 'evening', 'afternoon',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'next', 'week', 'at', 'my', 'to', 'pm', 'am',
  'les', 'des', 'une', 'pour', 'avec', 'demain', 'aujourd', 'matin', 'soir', 'ejo', 'uyu', 'munsi', 'mu', 'na', 'kuri',
]);

/** The words of a title worth remembering ("Pay Kigali rent" -> ["pay", "kigali", "rent"]). */
export function significantWords(text: string): string[] {
  return [...new Set(fold(text).split(/[^a-z0-9]+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)))];
}

export type SuggestOptions = {
  /** Word -> category the user chose for it before (learned on the phone). */
  learned?: Record<string, string>;
  /** Only suggest categories that exist (not deleted or archived). */
  usable?: (id: string) => boolean;
  /** Parent of a default subcategory, used when the subcategory was deleted. */
  parentOf?: (id: string) => string | null;
  type?: string | null;
};

const DEFAULT_PARENT: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.flatMap((parent) => parent.children.map((child) => [child.id, parent.id])),
);

/**
 * The category a task most likely belongs to: what the user taught ORDINA first, then the
 * keyword list, then the AI's task type. Null when nothing fits (the picker stays as it is).
 */
export function suggestCategory(text: string, options: SuggestOptions = {}): string | null {
  const usable = options.usable ?? (() => true);
  const pick = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (usable(id)) return id;
    const parent = options.parentOf?.(id) ?? DEFAULT_PARENT[id] ?? null;
    return parent && usable(parent) ? parent : null;
  };
  const learned = options.learned ?? {};
  for (const word of significantWords(text)) {
    const id = pick(learned[word]);
    if (id) return id;
  }
  const haystack = `${fold(text)} `;
  if (haystack.trim()) {
    for (const [id, pattern] of MATCHERS) {
      if (pattern.test(haystack)) {
        const chosen = pick(id);
        if (chosen) return chosen;
      }
    }
  }
  return pick(options.type ? TYPE_CATEGORY[options.type] : null);
}

/**
 * The user changed a suggested category: remember their choice for the title's words.
 * Returns the word -> category pairs to store.
 */
export function learnFromChoice(text: string, suggested: string | null, chosen: string): Record<string, string> {
  if (!chosen || chosen === suggested) return {};
  return Object.fromEntries(significantWords(text).map((word) => [word, chosen]));
}
