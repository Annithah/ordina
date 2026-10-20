import { create } from 'zustand';
import { api } from '@/services/api';
export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'archived';

export interface Project {
  id: string;
  name: string;
  subtitle?: string;
  status: ProjectStatus;
  progress: number; // 0–100
  color: string;
  tasksTotal: number;
  tasksCompleted: number;
  tasksOverdue: number;
  dueDate?: string;
  startDate?: string;
  priority?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsState {
  projects: Project[];
  loadProjects: () => Promise<void>;
  addProject: (project: { name: string; description?: string; color?: string; dueDate?: string; priority?: string }) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],

  loadProjects: async () => {
    const { data } = await api.get('/api/projects');
    set({ projects: data.projects ?? [] });
  },

  addProject: async (projectData) => {
    await api.post('/api/projects', projectData);
    await useProjectsStore.getState().loadProjects();
  },

  updateProject: async (id, updates) => {
    await api.patch(`/api/projects/${id}`, updates);
    await useProjectsStore.getState().loadProjects();
  },

  deleteProject: async (id) => {
    await api.delete(`/api/projects/${id}`);
    set((state) => ({ projects: state.projects.filter((project) => project.id !== id) }));
  },
}));
