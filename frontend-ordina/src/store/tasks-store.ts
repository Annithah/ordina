import { create } from 'zustand';

import type { Category, CategoryIcon } from '@/logic/categories';
import type { ReminderOption } from '@/logic/reminders';
import { notifyDataChanged } from '@/services/data-events';
import {
  categoryTaskCounts,
  createCategory,
  createLocalTask,
  deleteCategory,
  deleteLocalTask,
  listCategories,
  listLocalTasks,
  reorderCategories,
  setLocalTaskCompleted,
  updateCategory,
  updateLocalTask,
} from '@/services/local-tasks';
import { cancelReminderFor, syncReminderFor } from '@/services/task-reminders';
import { friendlyError } from '@/utils/task-validation';

export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  categoryId: string;
  /** YYYY-MM-DD. */
  dueDate?: string;
  /** "HH:MM"; empty for an Anytime task. */
  startTime?: string;
  /** "1h 30m"; empty for no duration. */
  duration?: string;
  reminder: ReminderOption;
  /** Local "YYYY-MM-DDTHH:MM" for a custom reminder. */
  reminderAt?: string | null;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", set when the user gave a deadline. */
  deadline?: string | null;
  completed: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Used only by the older server screens that are not in this build.
  projectId?: string;
  endTime?: string;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  recurrenceRule?: string;
  goalId?: string;
  parentTaskId?: string;
  contactName?: string;
  contactPhone?: string;
}

export type TaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'categoryId' | 'reminder' | 'startTime' | 'duration' | 'dueDate'>> & {
  title?: string;
  categoryId?: string;
  reminder?: ReminderOption;
  /** null clears the field. */
  startTime?: string | null;
  duration?: string | null;
  dueDate?: string | null;
};

type CategoryInput = { name: string; color: string; icon: CategoryIcon };

interface TasksState {
  tasks: Task[];
  categories: Category[];
  /** Tasks per category id. */
  counts: Record<string, number>;
  /** True until the first load finishes (successfully or not). */
  loading: boolean;
  loadError: string | null;
  /** Bumped after every change, so screens with their own queries (home filters) reload. */
  version: number;
  loadTasks: () => Promise<void>;
  getTaskById: (id: string) => Task | undefined;
  addTask: (task: TaskInput & { title: string }) => Promise<Task>;
  updateTask: (id: string, updates: TaskInput) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  toggleInProgress: (id: string) => Promise<void>;
  addCategory: (input: CategoryInput) => Promise<Category>;
  editCategory: (id: string, input: CategoryInput) => Promise<void>;
  removeCategory: (id: string, moveTo?: string | null) => Promise<string>;
  saveCategoryOrder: (ids: string[]) => Promise<void>;
}

/** Reminders are best-effort: a notification problem never undoes or blocks a saved change. */
function quietly(promise: Promise<unknown>) {
  void promise.catch(() => undefined);
}

export const useTasksStore = create<TasksState>((set, get) => {
  async function changed() {
    await get().loadTasks();
    set((state) => ({ version: state.version + 1 }));
    notifyDataChanged();
  }

  return {
    tasks: [],
    categories: [],
    counts: {},
    loading: true,
    loadError: null,
    version: 0,

    getTaskById: (id) => get().tasks.find((task) => task.id === id),

    loadTasks: async () => {
      try {
        const [tasks, categories, counts] = await Promise.all([listLocalTasks(), listCategories(), categoryTaskCounts()]);
        set({ tasks, categories, counts, loading: false, loadError: null });
      } catch (error) {
        set({ loading: false, loadError: friendlyError(error, 'Could not load your tasks.') });
      }
    },

    addTask: async (input) => {
      const created = await createLocalTask(input as Record<string, unknown>);
      quietly(syncReminderFor(created));
      await changed();
      return created;
    },

    updateTask: async (id, updates) => {
      const updated = await updateLocalTask(id, updates as Record<string, unknown>);
      quietly(syncReminderFor(updated));
      await changed();
      return updated;
    },

    deleteTask: async (id) => {
      await deleteLocalTask(id);
      set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
      quietly(cancelReminderFor(id));
      await changed();
    },

    toggleComplete: async (id) => {
      const task = get().tasks.find((item) => item.id === id);
      if (!task) return;
      const completed = !task.completed;
      // Optimistic: flip it now, roll back if saving fails.
      set((state) => ({
        tasks: state.tasks.map((item) => (item.id === id ? { ...item, completed, status: completed ? 'completed' : 'todo' } : item)),
      }));
      let updated: Task;
      try {
        updated = await setLocalTaskCompleted(id, completed);
      } catch (error) {
        set((state) => ({ tasks: state.tasks.map((item) => (item.id === id ? task : item)) }));
        throw error;
      }
      // Completing cancels the reminder; un-completing schedules it again if still ahead.
      quietly(syncReminderFor(updated));
      await changed();
    },

    toggleInProgress: async (id) => {
      const task = get().tasks.find((item) => item.id === id);
      if (!task || task.completed) return;
      const status = task.status === 'in_progress' ? 'todo' : 'in_progress';
      set((state) => ({ tasks: state.tasks.map((item) => (item.id === id ? { ...item, status } : item)) }));
      try {
        await updateLocalTask(id, { status });
      } finally {
        await changed();
      }
    },

    addCategory: async (input) => {
      const category = await createCategory(input);
      await changed();
      return category;
    },

    editCategory: async (id, input) => {
      await updateCategory(id, input);
      await changed();
    },

    removeCategory: async (id, moveTo) => {
      const target = await deleteCategory(id, moveTo);
      await changed();
      return target;
    },

    saveCategoryOrder: async (ids) => {
      // Show the new order at once; the database follows.
      const position = new Map(ids.map((id, index) => [id, index]));
      set((state) => ({
        categories: [...state.categories]
          .map((category) => ({ ...category, position: position.get(category.id) ?? category.position }))
          .sort((a, b) => a.position - b.position),
      }));
      await reorderCategories(ids);
      await changed();
    },
  };
});

export function categoryById(categories: Category[], id: string | undefined) {
  return categories.find((category) => category.id === id);
}
