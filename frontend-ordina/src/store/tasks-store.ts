import { create } from 'zustand';
import { Alert } from 'react-native';

import { LOCAL_MODE } from '@/config/release';
import { api } from '@/services/api';
import {
  createLocalTask,
  deleteLocalTask,
  listLocalTasks,
  setLocalTaskCompleted,
  updateLocalTask,
} from '@/services/local-tasks';
import { cancelTaskReminder } from '@/services/notifications';
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

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  loading: true,
  loadError: null,

  getTaskById: (id) => get().tasks.find((task) => task.id === id),

  loadTasks: async () => {
    try {
      // Offline mode: tasks live on this phone (SQLite); otherwise on the ORDINA server.
      const raw = LOCAL_MODE ? await listLocalTasks() : (await api.get('/api/tasks')).data?.tasks;
      const tasks = Array.isArray(raw) ? raw.map(normalizeTask) : [];
      set({ tasks, loading: false, loadError: null });
    } catch (error) {
      set({ loading: false, loadError: friendlyError(error, 'Could not load your tasks.') });
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
    try {
      await cancelTaskReminder(id);
    } catch (error) {
      Alert.alert(
        'Task deleted',
        error instanceof Error
          ? `The task was deleted, but its scheduled notification could not be canceled: ${error.message}`
          : 'The task was deleted, but its scheduled notification could not be canceled.',
      );
    }
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
    if (!task.completed) {
      try {
        await cancelTaskReminder(id);
      } catch (error) {
        Alert.alert(
          'Task completed',
          error instanceof Error
            ? `The task was completed, but its scheduled notification could not be canceled: ${error.message}`
            : 'The task was completed, but its scheduled notification could not be canceled.',
        );
      }
    }
    await get().loadTasks();
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
