'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  Users,
  ShieldCheck,
  HardDrive,
  Terminal,
  Settings,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  Flame,
  CheckCircle2,
  Copy,
  Check,
  FolderPlus,
  ChevronsUpDown,
  Plus,
  Mail,
  MessageSquare
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider, useToast } from './ui/Toast';
import { ProjectProvider, useProject } from './ProjectContext';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { API_BASE_URL } from '@/config';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Develop',
    items: [
      { name: 'Overview', href: '/', icon: LayoutDashboard },
      { name: 'Database', href: '/database', icon: Database },
      { name: 'Authentication', href: '/auth', icon: Users },
      { name: 'Storage', href: '/storage', icon: HardDrive },
    ],
  },
  {
    label: 'Communication',
    items: [
      { name: 'Email Settings', href: '/email', icon: Mail },
      { name: 'Contact Support', href: '/contact', icon: MessageSquare },
    ],
  },
  {
    label: 'Integration',
    items: [
      { name: 'SDK Setup', href: '/sdk-setup', icon: Terminal },
      { name: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

const ROUTE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Project Overview', subtitle: 'Real-time telemetry, storage metrics, and gateway status' },
  '/database': { title: 'Database Explorer', subtitle: 'Inspect, query, and mutate collections and document trees' },
  '/auth': { title: 'User Management', subtitle: 'Inspect active identities, JWT claims, and session states' },
  '/rules': { title: 'Security Rules', subtitle: 'Granular declarative RBAC/ABAC authorization rules and dry-run simulator' },
  '/storage': { title: 'Storage Buckets', subtitle: 'Manage objects, presigned uploads, and tenant asset storage' },
  '/email': { title: 'Email Settings', subtitle: 'Configure custom sender domains, DNS verification, and authorized identities' },
  '/contact': { title: 'Contact Support', subtitle: 'Submit platform inquiries, technical support, and feature requests' },
  '/sdk-setup': { title: 'SDK Integration', subtitle: 'Client SDK configuration and server admin credentials' },
  '/settings': { title: 'Project Settings', subtitle: 'Environment parameters, API keys, and operational limits' },
};

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userDisplayName, setUserDisplayName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const { addToast } = useToast();
  const {
    projects,
    activeProject,
    maxProjects,
    currentProjectCount,
    isLoading: isProjectsLoading,
    setActiveProjectId,
    createProject,
  } = useProject();

  const isPublicRoute = pathname === '/login' || pathname === '/register';

  useEffect(() => {
    if (isPublicRoute) {
      setAuthChecked(true);
      return;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      router.replace('/login');
      return;
    }

    const email = localStorage.getItem('auth_email') || '';
    const devStr = localStorage.getItem('auth_developer');
    if (devStr) {
      try {
        const dev = JSON.parse(devStr);
        setUserDisplayName(dev.displayName || dev.display_name || email.split('@')[0] || 'Developer');
        setUserEmail(dev.email || email);
      } catch {
        setUserDisplayName(email.split('@')[0] || 'Developer');
        setUserEmail(email);
      }
    } else {
      setUserDisplayName(email.split('@')[0] || 'Developer');
      setUserEmail(email);
    }

    // Authenticate session validity with live PostgreSQL backend
    const validateSession = async () => {
      try {
        const currentToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        if (!currentToken) return;

        const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/me`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (!res.ok) {
          // Token expired, developer account suspended, or password was reset!
          if (typeof window !== 'undefined') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_refresh_token');
            localStorage.removeItem('auth_developer');
            localStorage.removeItem('syntrabase_active_project_id');
            window.location.href = '/login?reason=session_revoked';
          }
          return;
        }

        const data = await res.json();
        if (data.developer) {
          setUserDisplayName(data.developer.displayName || data.developer.email.split('@')[0]);
          setUserEmail(data.developer.email);
        }
      } catch {
        // Offline / network blip — do not prematurely disconnect
      } finally {
        setAuthChecked(true);
      }
    };

    validateSession();

    // Heartbeat check every 3.5 seconds to immediately catch administrative password resets or session invalidations
    const interval = setInterval(validateSession, 3500);
    return () => clearInterval(interval);
  }, [pathname, isPublicRoute, router]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100vw',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f1115',
          color: '#9ca3af',
          fontFamily: 'var(--font-sans)',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            border: '3px solid rgba(59, 130, 246, 0.2)',
            borderTopColor: '#3b82f6',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: '0.88rem', color: '#9ca3af' }}>Verifying Developer Session...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const currentRouteMeta = ROUTE_TITLES[pathname] || {
    title: pathname.replace('/', '').replace(/-/g, ' ').toUpperCase(),
    subtitle: 'Developer Console Workspace',
  };

  const handleCopyProjectId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(activeProject.id);
    setCopiedId(true);
    addToast(`Copied Project ID (${activeProject.id}) to clipboard`, 'info');
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      addToast('Project name is required', 'error');
      return;
    }
    setIsCreatingProject(true);
    const success = await createProject(newProjectName.trim(), newProjectId.trim() || undefined);
    setIsCreatingProject(false);
    if (success) {
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectId('');
      setProjectSelectorOpen(false);
    }
  };

  return (
    <div className="app-container">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            zIndex: 99,
          }}
        />
      )}

      {/* Navigation Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Brand */}
        <div className="brand" style={{ paddingBottom: '16px' }}>
          <div
            className="brand-icon"
            style={{
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
            }}
          >
            <Flame size={20} color="#ffffff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Syntrabase
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Developer Console
            </div>
          </div>
          {mobileMenuOpen && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="btn btn-ghost"
              style={{ padding: '6px' }}
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Project Selector Badge & Dropdown */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <div
            onClick={() => setProjectSelectorOpen(!projectSelectorOpen)}
            style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Active Project
                </span>
                {isProjectsLoading ? (
                  <div className="skeleton-box animate-pulse" style={{ width: '24px', height: '10px', borderRadius: '3px' }} />
                ) : (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      color: currentProjectCount >= maxProjects ? 'var(--warning-text)' : 'var(--text-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {currentProjectCount}/{maxProjects}
                  </span>
                )}
              </div>
              {isProjectsLoading ? (
                <div style={{ padding: '3px 0' }}>
                  <div className="skeleton-box animate-pulse" style={{ width: '130px', height: '15px', borderRadius: '4px', marginBottom: '3px' }} />
                  <div className="skeleton-box animate-pulse" style={{ width: '90px', height: '10px', borderRadius: '3px' }} />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeProject?.name || 'Default Project'}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {activeProject?.id || '...'}
                  </div>
                </>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={handleCopyProjectId}
                className="btn btn-ghost"
                style={{ padding: '4px', height: '24px', width: '24px' }}
                title="Copy Project ID"
              >
                {copiedId ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
              </button>
              <ChevronsUpDown size={14} color="var(--text-muted)" />
            </div>
          </div>

          {/* Project Switcher Dropdown */}
          {projectSelectorOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: '4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 110,
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div
                style={{
                  padding: '6px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                <span>Projects ({projects.length})</span>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    background: currentProjectCount >= maxProjects ? 'var(--warning-subtle)' : 'var(--bg-surface-subtle)',
                    color: currentProjectCount >= maxProjects ? 'var(--warning-text)' : 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  {isProjectsLoading ? 'Loading Quota...' : `Quota: ${currentProjectCount} of ${maxProjects}`}
                </span>
              </div>

              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
                {projects.map((p) => {
                  const isSelected = p.id === activeProject.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setActiveProjectId(p.id);
                        setProjectSelectorOpen(false);
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                        color: isSelected ? 'var(--primary-text)' : 'var(--text-primary)',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {p.id}
                        </div>
                      </div>
                      {isSelected && <Check size={14} color="var(--primary)" />}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  setProjectSelectorOpen(false);
                  setShowCreateModal(true);
                }}
                disabled={currentProjectCount >= maxProjects}
                style={{
                  marginTop: '4px',
                  padding: '7px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px dashed var(--border-default)',
                  background: currentProjectCount >= maxProjects ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
                  color: currentProjectCount >= maxProjects ? 'var(--text-muted)' : 'var(--primary-text)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  cursor: isProjectsLoading ? 'wait' : currentProjectCount >= maxProjects ? 'not-allowed' : 'pointer',
                  width: '100%',
                }}
              >
                <Plus size={13} />
                <span>
                  {isProjectsLoading ? 'Verifying Plan Quota...' : currentProjectCount >= maxProjects ? 'Project Quota Full (Upgrade Plan)' : 'Create New Project'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Nav Groups */}
        {NAV_GROUPS.map((group) => (
          <nav key={group.label} className="nav-group">
            <span className="nav-label">{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={16} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        ))}

        {/* Sidebar Footer */}
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-emerald)',
                  display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Fastify Gateway</span>
            </div>
            <span className="badge badge-green" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
              Online
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Engine: v1.0.0</span>
            <Link
              href="/sdk-setup"
              style={{ color: 'var(--accent-blue)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}
            >
              Docs <ExternalLink size={10} />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        <header className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="btn btn-ghost"
              style={{ display: 'none', padding: '6px' }}
              id="mobile-nav-toggle"
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumbs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Console</span>
              <ChevronRight size={14} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{activeProject.name}</span>
              <ChevronRight size={14} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentRouteMeta.title}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Quick SDK Action */}
            <Link href="/sdk-setup" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
              <Terminal size={14} />
              <span className="hide-mobile">SDK Config</span>
            </Link>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* User Profile with Interactive Dropdown */}
            <div style={{ position: 'relative' }}>
              <div
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  paddingLeft: '12px',
                  borderLeft: '1px solid var(--border-color)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--accent-blue)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                  }}
                >
                  {!authChecked ? (
                    <div className="skeleton-box animate-pulse" style={{ width: '12px', height: '12px', borderRadius: '50%' }} />
                  ) : (
                    (userDisplayName || userEmail || 'D')[0].toUpperCase()
                  )}
                </div>
                <div className="hide-mobile" style={{ display: 'flex', flexDirection: 'column' }}>
                  {!authChecked ? (
                    <>
                      <div className="skeleton-box animate-pulse" style={{ width: '70px', height: '12px', borderRadius: '3px', marginBottom: '3px' }} />
                      <div className="skeleton-box animate-pulse" style={{ width: '110px', height: '10px', borderRadius: '3px' }} />
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                        {userDisplayName || 'Developer'}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1 }}>
                        {userEmail}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {profileMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '40px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    boxShadow: 'var(--shadow-lg)',
                    minWidth: '220px',
                    zIndex: 100,
                    padding: '6px 0',
                  }}
                >
                  <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Signed in as</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      {userEmail || 'Developer'}
                    </div>
                  </div>
                  <Link
                    href="/settings"
                    onClick={() => setProfileMenuOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      fontSize: '0.82rem',
                    }}
                    className="menu-item-hover"
                  >
                    <span>Project Settings</span>
                  </Link>
                  <button
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('auth_token');
                        localStorage.removeItem('auth_refresh_token');
                        localStorage.removeItem('auth_email');
                        localStorage.removeItem('auth_developer');
                        localStorage.removeItem('syntrabase_active_project_id');
                      }
                      setProfileMenuOpen(false);
                      addToast('Signed out of Developer Console', 'info');
                      router.push('/login');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      color: 'var(--accent-rose)',
                      background: 'none',
                      border: 'none',
                      width: '100%',
                      textAlign: 'left',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      borderTop: '1px solid var(--border-color)',
                    }}
                    className="menu-item-hover"
                  >
                    <span>Sign Out / Switch Account</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`page-body ${pathname === '/database' ? 'page-body-full-bleed' : ''}`}>
          {children}
        </main>
      </div>

      {/* Create Project Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Project"
      >
        <form onSubmit={handleCreateProjectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Plan Allowance</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {currentProjectCount} of {maxProjects} projects used
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Project Name <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <Input
              placeholder="e.g. Acme Production Backend"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value);
                if (!newProjectId || newProjectId === newProjectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')) {
                  setNewProjectId(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                }
              }}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Project ID (Identifier)
            </label>
            <Input
              placeholder="e.g. acme-prod-backend"
              value={newProjectId}
              onChange={(e) => setNewProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Used in SDK initialization and API endpoints. Permanent identifier.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowCreateModal(false)}
              disabled={isCreatingProject}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isCreatingProject || !newProjectName.trim()}
            >
              {isCreatingProject ? 'Creating Project...' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ProjectProvider>
          <ShellInner>{children}</ShellInner>
        </ProjectProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
