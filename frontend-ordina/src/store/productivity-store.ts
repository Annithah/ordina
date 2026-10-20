import { create } from 'zustand';

import { api } from '@/services/api';

export type Goal = {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  target: number;
  current: number;
  progress?: number;
  dueDate?: string;
  completed: boolean;
  projectId?: number | null;
};

export type Reminder = {
  id: number;
  title: string;
  remindAt: string;
  enabled: boolean;
  status: string;
  completed: boolean;
  taskId?: number | null;
};

export type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  relatedType?: string | null;
  relatedId?: number | null;
  read: boolean;
  createdAt: string;
};

type ProductivityState = {
  goals: Goal[];
  reminders: Reminder[];
  notifications: NotificationItem[];
  loadGoals: () => Promise<void>;
  loadReminders: () => Promise<void>;
  loadNotifications: () => Promise<void>;
  addGoal: (payload: { title: string; description?: string; dueDate?: string; priority?: string; status?: string }) => Promise<void>;
  updateGoal: (id: number, payload: Partial<Goal>) => Promise<void>;
  addReminder: (payload: { title: string; remindAt: string; enabled?: boolean }) => Promise<void>;
  updateReminder: (id: number, payload: Partial<Reminder>) => Promise<void>;
  completeGoal: (id: number, completed: boolean) => Promise<void>;
  completeReminder: (id: number, completed: boolean) => Promise<void>;
  deleteGoal: (id: number) => Promise<void>;
  deleteReminder: (id: number) => Promise<void>;
  markNotificationRead: (id: number) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
};

export const useProductivityStore = create<ProductivityState>((set, get) => ({
  goals: [],
  reminders: [],
  notifications: [],
  loadGoals: async () => {
    const { data } = await api.get('/api/goals');
    set({ goals: data.goals ?? [] });
  },
  loadReminders: async () => {
    const { data } = await api.get('/api/reminders');
    set({ reminders: data.reminders ?? [] });
  },
  loadNotifications: async () => {
    const { data } = await api.get('/api/notifications');
    set({ notifications: data.notifications ?? [] });
  },
  addGoal: async (payload) => {
    await api.post('/api/goals', payload);
    await get().loadGoals();
  },
  updateGoal: async (id, payload) => {
    await api.patch(`/api/goals/${id}`, payload);
    await get().loadGoals();
  },
  addReminder: async (payload) => {
    await api.post('/api/reminders', payload);
    await get().loadReminders();
  },
  updateReminder: async (id, payload) => {
    await api.patch(`/api/reminders/${id}`, payload);
    await get().loadReminders();
  },
  completeGoal: async (id, completed) => {
    await api.patch(`/api/goals/${id}`, { completed, status: completed ? 'completed' : 'in_progress' });
    await get().loadGoals();
  },
  completeReminder: async (id, completed) => {
    await api.patch(`/api/reminders/${id}`, { completed, status: completed ? 'completed' : 'scheduled' });
    await get().loadReminders();
  },
  deleteGoal: async (id) => {
    await api.delete(`/api/goals/${id}`);
    set((state) => ({ goals: state.goals.filter((goal) => goal.id !== id) }));
  },
  deleteReminder: async (id) => {
    await api.delete(`/api/reminders/${id}`);
    set((state) => ({ reminders: state.reminders.filter((reminder) => reminder.id !== id) }));
  },
  markNotificationRead: async (id) => {
    await api.patch(`/api/notifications/${id}/read`);
    set((state) => ({
      notifications: state.notifications.map((item) => (item.id === id ? { ...item, read: true } : item)),
    }));
  },
  markAllNotificationsRead: async () => {
    await api.post('/api/notifications/read-all');
    set((state) => ({ notifications: state.notifications.map((item) => ({ ...item, read: true })) }));
  },
  deleteNotification: async (id) => {
    await api.delete(`/api/notifications/${id}`);
    set((state) => ({ notifications: state.notifications.filter((item) => item.id !== id) }));
  },
}));
