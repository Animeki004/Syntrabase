'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API_BASE_URL } from '@/config';
import { useToast } from './ui/Toast';

export interface ProjectItem {
  id: string;
  name: string;
  slug?: string;
  status?: string;
  planId?: string;
  planName?: string;
  planSlug?: string;
  maxProjects?: number;
  maxDatabases?: number;
  dedicatedBrevoEnabled?: boolean;
  createdAt?: string;
}

interface ProjectContextType {
  projects: ProjectItem[];
  activeProject: ProjectItem;
  isSuspended: boolean;
  maxProjects: number;
  currentProjectCount: number;
  isLoading: boolean;
  setActiveProjectId: (projectId: string) => void;
  createProject: (name: string, customId?: string) => Promise<boolean>;
  deleteProject: (projectId: string, confirmationName: string) => Promise<boolean>;
  refreshProjects: () => Promise<void>;
}

const DEFAULT_PROJECT: ProjectItem = {
  id: '00000000-0000-0000-0000-000000000020',
  name: 'Syntrabase Production Cluster',
  slug: 'default-project',
  status: 'active',
  planName: 'Pro Tier',
  planSlug: 'pro',
};

const ProjectContext = createContext<ProjectContextType>({
  projects: [DEFAULT_PROJECT],
  activeProject: DEFAULT_PROJECT,
  isSuspended: false,
  maxProjects: 1,
  currentProjectCount: 1,
  isLoading: false,
  setActiveProjectId: () => {},
  createProject: async () => false,
  deleteProject: async () => false,
  refreshProjects: async () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('syntrabase_cached_projects');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [DEFAULT_PROJECT];
  });
  const [activeProject, setActiveProject] = useState<ProjectItem>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('syntrabase_cached_projects');
        const activeId = localStorage.getItem('syntrabase_active_project_id');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const found = parsed.find((p: any) => p.id === activeId || p.slug === activeId);
            return found || parsed[0];
          }
        }
      } catch {}
    }
    return DEFAULT_PROJECT;
  });
  const [maxProjects, setMaxProjects] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('syntrabase_max_projects');
        if (cached) return parseInt(cached, 10);
      } catch {}
    }
    return 3;
  });
  const [currentProjectCount, setCurrentProjectCount] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const { addToast } = useToast();

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token || token === 'undefined' || token === 'null' || token.trim() === '') {
        setIsLoading(false);
        return;
      }
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/projects`, { headers });
      if (res.status === 401 || res.status === 403) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_refresh_token');
          localStorage.removeItem('auth_developer');
          localStorage.removeItem('syntrabase_active_project_id');
          localStorage.removeItem('syntrabase_cached_projects');
          window.location.href = '/login?reason=session_expired';
        }
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.projects)) {
          setProjects(data.projects);
          setCurrentProjectCount(data.currentProjectCount || data.projects.length);
          if (typeof window !== 'undefined') {
            localStorage.setItem('syntrabase_cached_projects', JSON.stringify(data.projects));
            if (data.maxProjects) {
              localStorage.setItem('syntrabase_max_projects', String(data.maxProjects));
            }
          }

          if (data.projects.length > 0) {
            const savedId = typeof window !== 'undefined' ? localStorage.getItem('syntrabase_active_project_id') : null;
            const found = data.projects.find((p: ProjectItem) => p.id === savedId || (savedId && p.slug === savedId));
            const targetProject = found || data.projects[0];
            setActiveProject(targetProject);
            setMaxProjects(targetProject.maxProjects || data.maxProjects || 3);
            if (typeof window !== 'undefined') {
              localStorage.setItem('syntrabase_active_project_id', targetProject.id);
            }
          } else {
            setMaxProjects(data.maxProjects || 3);
          }
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const setActiveProjectId = (projectId: string) => {
    const found = projects.find((p) => p.id === projectId);
    if (found) {
      setActiveProject(found);
      if (found.maxProjects) {
        setMaxProjects(found.maxProjects);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('syntrabase_active_project_id', projectId);
      }
      addToast(`Switched active project to ${found.name}`, 'info');
    }
  };

  const createProject = async (name: string, customId?: string): Promise<boolean> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        addToast('Authentication required to create a project', 'error');
        return false;
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/projects`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          slug: customId?.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'PROJECT_QUOTA_EXCEEDED') {
          addToast(
            `Project limit reached (${data.current || currentProjectCount} of ${data.max || maxProjects}). Contact Super Admin to upgrade plan.`,
            'error'
          );
        } else {
          addToast(data.message || 'Failed to create project', 'error');
        }
        return false;
      }

      addToast(`Project "${data.project.name}" created successfully!`, 'success');
      await fetchProjects();
      setActiveProjectId(data.project.id);
      return true;
    } catch (err: any) {
      addToast(err.message || 'Network error creating project', 'error');
      return false;
    }
  };

  const deleteProject = async (projectId: string, confirmationName: string): Promise<boolean> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        addToast('Authentication required to delete a project', 'error');
        return false;
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({
          confirmationName: confirmationName.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        addToast(data.message || 'Failed to delete project', 'error');
        return false;
      }

      addToast('Project deleted successfully', 'success');
      await fetchProjects();
      return true;
    } catch (err: any) {
      addToast(err.message || 'Network error deleting project', 'error');
      return false;
    }
  };

  const isSuspended = activeProject?.status === 'suspended';

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        isSuspended,
        maxProjects,
        currentProjectCount,
        isLoading,
        setActiveProjectId,
        createProject,
        deleteProject,
        refreshProjects: fetchProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return useContext(ProjectContext);
}
