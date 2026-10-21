import { create } from 'zustand';

import { LOCAL_MODE } from '@/config/release';
import { api } from '@/services/api';
import {
  createLocalTask,
  deleteLocalTask,
  listLocalTasks,
  setLocalTaskCompleted,
  updateLocalTask,
} from '@/services/local-tasks';
import { toast } from '@/components/toast';
import { celebrateIfAllDone, requestReschedule } from '@/services/notifications';
import { normalizeCategory } from '@/features/categories';
import { friendlyError } from '@/utils/task-validation';

export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'todo' | 'in_progress' | 'completed';
/** A category id from features/categories (e.g. "work", "exams", "bills"). */
export type Category = string;

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  category: Category;
  projectId?: string;
  dueDate?: string; // ISO date string
  startTime?: string; // "HH:MM"
  endTime?: string; // "HH:MM"
  duration?: string; // "1h 30m"
  reminder?: boolean;
  /** Minutes before the start (0 = at start); null or undefined = no reminder. */
  reminderLead?: number | null;
  /** Anytime tasks: the time of day to remind ("HH:MM"). */
  reminderTime?: string | null;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  recurrenceRule?: string;
  goalId?: string;
  parentTaskId?: string;
  contactName?: string;
  contactPhone?: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM", set when the user gave a deadline. */
  deadline?: string | null;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TasksState {
  tasks: Task[];
  /** True until the first load finishes (successfully or not). */
  loading: boolean;
  /** Last load error; the previous list stays visible so a flaky network never looks like "no tasks". */
  loadError: string | null;
  /** The technical reason of the last load error, shown small so problems can be reported. */
  loadErrorDetail: string | null;
  loadTasks: () => Promise<void>;
  getTaskById: (id: string) => Task | undefined;
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
  toggleInProgress: (id: string) => Promise<void>;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeTask(task: any): Task {
  return {
    id: String(task.id ?? generateId()),
    title: task.title ?? 'Untitled task',
    description: task.description ?? '',
    status: task.status === 'completed' ? 'completed' : task.status === 'in_progress' ? 'in_progress' : 'todo',
    priority: task.priority === 'high' || task.priority === 3 ? 'high' : task.priority === 'medium' || task.priority === 2 ? 'medium' : 'low',
    category: normalizeCategory(task.category),
    projectId: task.projectId ? String(task.projectId) : undefined,
    dueDate: task.dueDate ?? task.due_at ?? undefined,
    startTime: task.startTime ?? undefined,
    endTime: task.endTime ?? undefined,
    duration: task.duration ?? '1h',
    reminder: task.reminder ?? false,
    reminderLead: task.reminderLead ?? (task.reminder ? 10 : null),
    reminderTime: task.reminderTime ?? null,
    recurrence: task.recurrence ?? 'none',
    recurrenceRule: task.recurrenceRule ?? undefined,
    goalId: task.goalId ? String(task.goalId) : undefined,
    parentTaskId: task.parentTaskId ? String(task.parentTaskId) : undefined,
    contactName: task.contactName ?? undefined,
    contactPhone: task.contactPhone ?? undefined,
    deadline: task.deadline ?? undefined,
    completed: Boolean(task.completed),
    createdAt: task.createdAt ?? new Date().toISOString(),
    updatedAt: task.updatedAt ?? new Date().toISOString(),
  };
}

let lastSignature = '';

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: true,
  loadError: null,
  loadErrorDetail: null,

  getTaskById: (id) => get().tasks.find((task) => task.id === id),

  loadTasks: async () => {
    try {
      // Offline mode: tasks live on this phone (SQLite); otherwise on the ORDINA server.
      const raw = LOCAL_MODE ? await listLocalTasks() : (await api.get('/api/tasks')).data?.tasks;
      const tasks = Array.isArray(raw) ? raw.map(normalizeTask) : [];
      // Any change to the tasks (here, from ORDINA AI, a backup...) re-plans the notifications.
      const signature = tasks.map((task) => `${task.id}|${task.dueDate}|${task.startTime}|${task.completed}|${task.updatedAt}|${task.reminderLead}|${task.reminderTime}`).join(';');
      if (signature !== lastSignature) {
        lastSignature = signature;
        requestReschedule('tasks');
      }
      set({ tasks, loading: false, loadError: null, loadErrorDetail: null });
    } catch (error) {
      set({
        loading: false,
        loadError: friendlyError(error, 'Could not load your tasks.'),
        loadErrorDetail: error instanceof Error ? error.message : String(error),
      });
    }
  },

  addTask: async (taskData) => {
    const created = LOCAL_MODE
      ? await createLocalTask(taskData as Record<string, unknown>)
      : (await api.post('/api/tasks', taskData)).data.task;
    await get().loadTasks();
    return normalizeTask(created);
  },

  updateTask: async (id, updates) => {
    if (LOCAL_MODE) {
      await updateLocalTask(id, updates as Record<string, unknown>);
    } else {
      await api.patch(`/api/tasks/${id}`, {
        ...updates,
        projectId: updates.projectId === undefined ? undefined : updates.projectId || null,
      });
    }
    await get().loadTasks();
  },

  deleteTask: async (id) => {
    if (LOCAL_MODE) await deleteLocalTask(id);
    else await api.delete(`/api/tasks/${id}`);
    set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }));
    // Its reminder and nudges disappear with it.
    requestReschedule('deleted');
  },

  toggleComplete: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task) return;
    const completed = !task.completed;
    // Optimistic: flip it now, roll back if the server refuses.
    set((state) => ({
      tasks: state.tasks.map((item) => (item.id === id
        ? { ...item, completed, status: completed ? 'completed' : 'todo' }
        : item)),
    }));
    try {
      if (LOCAL_MODE) await setLocalTaskCompleted(id, completed);
      else await api.patch(`/api/tasks/${id}/complete`, { completed });
    } catch (error) {
      set((state) => ({ tasks: state.tasks.map((item) => (item.id === id ? task : item)) }));
      throw error;
    }
    await get().loadTasks();
    // Done: its reminder is cancelled by the re-plan; finishing the day is celebrated.
    if (completed) void celebrateIfAllDone((title, body) => toast.success(`${title} ${body}`)).catch(() => undefined);
  },

  toggleInProgress: async (id) => {
    const task = get().tasks.find((item) => item.id === id);
    if (!task || task.completed) return;
    const status = task.status === 'in_progress' ? 'todo' : 'in_progress';
    set((state) => ({ tasks: state.tasks.map((item) => (item.id === id ? { ...item, status } : item)) }));
    try {
      if (LOCAL_MODE) await updateLocalTask(id, { status });
      else await api.patch(`/api/tasks/${id}`, { status });
    } finally {
      await get().loadTasks();
    }
  },
}));
