import { create } from 'zustand';

import { LOCAL_MODE } from '@/config/release';
import { setCategoryRegistry } from '@/features/categories';
import {
  OTHER_ID,
  defaultRecords,
  learnFromChoice,
  planDelete,
  planMerge,
  reorder,
  suggestCategory,
  validateCategoryName,
  type CategoryRecord,
  type NameError,
} from '@/features/category-tree';
import { translate } from '@/i18n/translations';
import { api } from '@/services/api';
import {
  applyDelete,
  applyMerge,
  insertCategory,
  listCategories,
  loadLearned,
  moveLocalTasks,
  patchCategory,
  recentCategoryIds,
  saveLearned,
  saveOrder,
} from '@/services/local-categories';
import { useTasksStore } from '@/store/tasks-store';

/** Thrown with a translated message the screens show as is. */
export class CategoryError extends Error {}

const NAME_ERROR: Record<NameError, string> = {
  empty: 'categories.errors.empty',
  tooLong: 'categories.errors.tooLong',
  duplicate: 'categories.errors.duplicate',
};

/** A category's name: the user's own, or the translated default name. */
export function nameOf(record: Pick<CategoryRecord, 'id' | 'name'>): string {
  return record.name || translate(`categories.defaults.${record.id}`);
}

type CategoriesState = {
  categories: CategoryRecord[];
  learned: Record<string, string>;
  recent: string[];
  loaded: boolean;
  load: () => Promise<void>;
  create: (input: { name: string; color: string; icon: string; parentId: string | null }) => Promise<string>;
  update: (id: string, patch: Partial<Pick<CategoryRecord, 'name' | 'color' | 'icon'>>) => Promise<void>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  move: (parentId: string | null, from: number, to: number) => Promise<void>;
  remove: (id: string, choice: { moveTo: string } | { deleteTasks: true }) => Promise<void>;
  merge: (sourceId: string, targetId: string) => Promise<void>;
  moveTasks: (taskIds: string[], categoryId: string) => Promise<void>;
  /** Best category for a title, using what the user taught ORDINA. */
  suggest: (text: string, type?: string | null) => string | null;
  /** The user picked `chosen` instead of the suggestion: remember it. */
  learn: (text: string, suggested: string | null, chosen: string) => Promise<void>;
};

function live(categories: CategoryRecord[]) {
  return categories.filter((record) => !record.deletedAt);
}

/** Server-mode tasks live on the ORDINA server: change them there too. */
async function updateServerTasks(categoryIds: string[], next: string | null) {
  if (LOCAL_MODE) return;
  const ids = new Set(categoryIds);
  const affected = useTasksStore.getState().tasks.filter((task) => ids.has(task.category));
  for (const task of affected) {
    if (next) await api.patch(`/api/tasks/${task.id}`, { category: next });
    else await api.delete(`/api/tasks/${task.id}`);
  }
}

export const useCategoriesStore = create<CategoriesState>((set, get) => {
  async function refresh() {
    const [categories, learned, recent] = await Promise.all([listCategories(), loadLearned(), recentCategoryIds()]);
    setCategoryRegistry(categories);
    set({ categories, learned, recent, loaded: true });
  }

  function check(name: string, parentId: string | null, excludeId?: string) {
    const error = validateCategoryName(name, parentId, get().categories, nameOf, excludeId);
    if (error) throw new CategoryError(translate(NAME_ERROR[error]));
  }

  return {
    categories: defaultRecords(''),
    learned: {},
    recent: [],
    loaded: false,

    load: async () => {
      try {
        await refresh();
      } catch {
        // The defaults keep working if the database cannot be opened.
        set({ loaded: true });
      }
    },

    create: async (input) => {
      check(input.name, input.parentId);
      if (input.parentId && get().categories.find((record) => record.id === input.parentId)?.parentId) {
        throw new CategoryError(translate('categories.errors.depth'));
      }
      const id = await insertCategory(input);
      await refresh();
      return id;
    },

    update: async (id, patch) => {
      const record = get().categories.find((item) => item.id === id);
      if (!record) return;
      if (patch.name !== undefined) check(patch.name, record.parentId, id);
      // Keeping a default's translated name: store nothing when the name is unchanged.
      const name = patch.name !== undefined && record.isDefault && !record.name && patch.name.trim() === nameOf(record) ? undefined : patch.name;
      await patchCategory(id, { ...patch, name });
      await refresh();
    },

    setArchived: async (id, archived) => {
      if (id === OTHER_ID && archived) throw new CategoryError(translate('categories.errors.otherArchive'));
      await patchCategory(id, { isArchived: archived });
      await refresh();
    },

    setPinned: async (id, pinned) => {
      await patchCategory(id, { isPinned: pinned });
      await refresh();
    },

    move: async (parentId, from, to) => {
      const siblings = live(get().categories)
        .filter((record) => (record.parentId ?? null) === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const order = reorder(siblings.map((record) => record.id), from, to);
      // Show the new order at once; the database follows.
      set((state) => ({
        categories: state.categories.map((record) => {
          const next = order.find((item) => item.id === record.id);
          return next ? { ...record, sortOrder: next.sortOrder } : record;
        }),
      }));
      await saveOrder(order);
      await refresh();
    },

    remove: async (id, choice) => {
      let plan;
      try {
        plan = planDelete(id, get().categories, choice);
      } catch (error) {
        throw new CategoryError(id === OTHER_ID ? translate('categories.errors.otherDelete') : (error as Error).message);
      }
      await updateServerTasks(plan.removeIds, plan.moveTasksTo);
      await applyDelete(plan);
      await refresh();
      await useTasksStore.getState().loadTasks();
    },

    merge: async (sourceId, targetId) => {
      let plan;
      try {
        plan = planMerge(sourceId, targetId, get().categories);
      } catch (error) {
        throw new CategoryError((error as Error).message);
      }
      await updateServerTasks(plan.moveTaskIds, plan.target);
      await applyMerge(plan);
      await refresh();
      await useTasksStore.getState().loadTasks();
    },

    moveTasks: async (taskIds, categoryId) => {
      if (LOCAL_MODE) await moveLocalTasks(taskIds, categoryId);
      else for (const id of taskIds) await api.patch(`/api/tasks/${id}`, { category: categoryId });
      await useTasksStore.getState().loadTasks();
      await refresh();
    },

    suggest: (text, type) => {
      const { categories, learned } = get();
      const usableIds = new Set(live(categories).filter((record) => !record.isArchived).map((record) => record.id));
      return suggestCategory(text, {
        learned,
        type,
        usable: (id) => usableIds.has(id),
        parentOf: (id) => categories.find((record) => record.id === id)?.parentId ?? null,
      });
    },

    learn: async (text, suggested, chosen) => {
      const words = learnFromChoice(text, suggested, chosen);
      if (!Object.keys(words).length) return;
      set((state) => ({ learned: { ...state.learned, ...words } }));
      await saveLearned(words).catch(() => undefined);
    },
  };
});
