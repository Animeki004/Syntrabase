'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Users,
  Search,
  Power,
  Shield,
  Layers,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Lock,
  Unlock,
  KeyRound,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Sliders,
  Mail
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface DeveloperRecord {
  id: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
  status: 'active' | 'suspended';
  createdAt: string;
  projectCount: number | string;
}

interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  dedicatedBrevoEnabled?: boolean;
  organizationName?: string;
  ownerEmail: string;
  planName?: string;
  planSlug?: string;
  documentsCount: number;
  storageBytes: number | string;
  createdAt: string;
}

export default function TenantsAndDevelopersPage() {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'developers' | 'projects'>('developers');
  const [developers, setDevelopers] = useState<DeveloperRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Modals
  const [confirmStatusModal, setConfirmStatusModal] = useState<{
    developer: DeveloperRecord;
    targetStatus: 'active' | 'suspended';
  } | null>(null);

  const [deleteDevModal, setDeleteDevModal] = useState<DeveloperRecord | null>(null);

  const [confirmProjectModal, setConfirmProjectModal] = useState<{
    project: ProjectRecord;
    targetStatus: 'active' | 'suspended';
  } | null>(null);

  // Developer Password Reset Modal
  const [resetPasswordModal, setResetPasswordModal] = useState<DeveloperRecord | null>(null);
  const [tempPassword, setTempPassword] = useState('');
  const [resetResult, setResetResult] = useState<{
    temporaryPassword: string;
    message: string;
    mailDispatched: boolean;
  } | null>(null);

  const [togglingBrevoId, setTogglingBrevoId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getAdminToken(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || '';
    }
    return '';
  }

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const token = getAdminToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [devsRes, projsRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/admin/developers`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/projects`, { headers }),
      ]);

      if (devsRes.ok) {
        const devsData = await devsRes.json();
        setDevelopers(devsData.developers || []);
      }

      if (projsRes.ok) {
        const projsData = await projsRes.json();
        setProjects(projsData.projects || []);
      }
    } catch {
      addToast('Failed to load telemetry from API gateway', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Developer Status Toggle
  const handleToggleDeveloperStatus = async () => {
    if (!confirmStatusModal) return;
    const { developer, targetStatus } = confirmStatusModal;
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/developers/${developer.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ status: targetStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.message || data.error || 'Failed to update developer status', 'error');
        return;
      }

      addToast(
        `Developer ${developer.email} access has been ${targetStatus === 'suspended' ? 'REVOKED' : 'ACTIVATED'}`,
        targetStatus === 'suspended' ? 'warning' : 'success'
      );
      setConfirmStatusModal(null);
      await fetchData();
    } catch (err: any) {
      addToast(err.message || 'Network error updating developer status', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Developer
  const handleDeleteDeveloper = async () => {
    if (!deleteDevModal) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/developers/${deleteDevModal.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${getAdminToken()}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.message || data.error || 'Failed to delete developer', 'error');
        return;
      }

      addToast(`Developer ${deleteDevModal.email} permanently removed`, 'success');
      setDeleteDevModal(null);
      await fetchData();
    } catch (err: any) {
      addToast(err.message || 'Network error deleting developer', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Project Status Toggle
  const handleToggleProjectStatus = async () => {
    if (!confirmProjectModal) return;
    const { project, targetStatus } = confirmProjectModal;
    setIsSubmitting(true);

    try {
      const endpoint =
        targetStatus === 'suspended'
          ? `${API_BASE}/api/v1/admin/projects/${project.id}/suspend`
          : `${API_BASE}/api/v1/admin/projects/${project.id}/activate`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAdminToken()}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        addToast(data.message || data.error || 'Failed to update project status', 'error');
        return;
      }

      addToast(
        `Project ${project.name} is now ${targetStatus.toUpperCase()}`,
        targetStatus === 'suspended' ? 'warning' : 'success'
      );
      setConfirmProjectModal(null);
      await fetchData();
    } catch (err: any) {
      addToast(err.message || 'Network error updating project status', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Developer Password Reset
  const handleResetPassword = async () => {
    if (!resetPasswordModal) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/developers/${resetPasswordModal.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ temporaryPassword: tempPassword.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Failed to reset developer password', 'error');
        return;
      }
      setResetResult({
        temporaryPassword: data.temporaryPassword,
        message: data.message,
        mailDispatched: data.mailDispatched,
      });
      addToast(data.message || 'Password reset successfully', 'success');
    } catch (err: any) {
      addToast(err.message || 'Network error during password reset', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Dedicated Brevo Toggle
  const handleToggleDedicatedBrevo = async (project: ProjectRecord) => {
    setTogglingBrevoId(project.id);
    const targetState = !project.dedicatedBrevoEnabled;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/projects/${project.id}/dedicated-brevo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ enabled: targetState }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, dedicatedBrevoEnabled: targetState } : p))
        );
        addToast(
          `Dedicated Brevo sending ${targetState ? 'ENABLED' : 'DISABLED'} for project "${project.name}"`,
          'success'
        );
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'Failed to toggle dedicated Brevo', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Network error', 'error');
    } finally {
      setTogglingBrevoId(null);
    }
  };

  function formatBytes(bytes: number | string) {
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (!num || num === 0) return '0 B';
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
    if (num < 1024 * 1024 * 1024) return (num / (1024 * 1024)).toFixed(1) + ' MB';
    return (num / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  const filteredDevelopers = developers.filter(
    (d) =>
      d.email.toLowerCase().includes(search.toLowerCase()) ||
      (d.displayName && d.displayName.toLowerCase().includes(search.toLowerCase())) ||
      d.id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()) ||
      p.ownerEmail.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase())
  );

  const activeDevelopersCount = developers.filter((d) => d.status === 'active').length;
  const suspendedDevelopersCount = developers.filter((d) => d.status === 'suspended').length;
  const activeProjectsCount = projects.filter((p) => p.status === 'active').length;
  const suspendedProjectsCount = projects.filter((p) => p.status === 'suspended').length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Console Users &amp; Tenant Governance
            </h1>
            <Badge variant="success" dot>Live Database Synced</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Authoritative fleet management of registered console developers, tenant workspaces, and access suspension.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={fetchData}
            disabled={isRefreshing}
            icon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          >
            {isRefreshing ? 'Synchronizing...' : 'Refresh Fleet'}
          </Button>
        </div>
      </div>

      {/* KPI Metric Cards - Single Row Grid */}
      <div className="grid-3" style={{ marginBottom: '24px' }}>
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Console Developers
              </span>
              <Users size={16} color="var(--accent-blue)" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '...' : developers.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--accent-emerald)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} /> {activeDevelopersCount} Active • {suspendedDevelopersCount} Suspended
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Tenant Projects
              </span>
              <Building2 size={16} color="var(--accent-emerald)" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '...' : projects.length}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              {activeProjectsCount} Online • {suspendedProjectsCount} Quarantined
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Total Fleet Documents
              </span>
              <Layers size={16} color="var(--accent-purple)" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {isLoading
                ? '...'
                : projects.reduce((acc, p) => acc + (Number(p.documentsCount) || 0), 0).toLocaleString()}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Across all isolated tenant databases
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs & Search Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant={activeTab === 'developers' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('developers')}
          >
            <Users size={14} style={{ marginRight: '6px' }} />
            Registered Developers ({developers.length})
          </Button>
          <Button
            variant={activeTab === 'projects' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('projects')}
          >
            <Building2 size={14} style={{ marginRight: '6px' }} />
            Tenant Projects ({projects.length})
          </Button>
        </div>

        <div style={{ width: '280px', position: 'relative' }}>
          <Input
            type="text"
            placeholder={activeTab === 'developers' ? 'Search by email or name...' : 'Search by project name or owner...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '10px', pointerEvents: 'none' }} />
        </div>
      </div>

      {/* TAB 1: Registered Developers Table */}
      {activeTab === 'developers' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Console Developer Directory</CardTitle>
                <CardDescription>
                  All accounts registered on the Developer Console. Super Admins can revoke credentials or reactivate accounts immediately.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Developer Account</th>
                  <th style={{ padding: '12px 16px' }}>Role &amp; Verification</th>
                  <th style={{ padding: '12px 16px' }}>Projects Owned</th>
                  <th style={{ padding: '12px 16px' }}>Account Status</th>
                  <th style={{ padding: '12px 16px' }}>Registered At</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Governance Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                      Loading developer records from database...
                    </td>
                  </tr>
                ) : filteredDevelopers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No registered developers found matching &quot;{search}&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredDevelopers.map((dev) => (
                    <tr key={dev.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              backgroundColor: dev.isPlatformAdmin ? 'rgba(239, 68, 68, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: dev.isPlatformAdmin ? '#ef4444' : '#3b82f6',
                            }}
                          >
                            {dev.isPlatformAdmin ? <Shield size={16} /> : <Users size={16} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {dev.displayName || 'Developer'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {dev.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {dev.isPlatformAdmin ? (
                            <Badge variant="danger">Platform Root</Badge>
                          ) : (
                            <Badge variant="outline">Developer</Badge>
                          )}
                          {dev.emailVerified ? (
                            <Badge variant="success">Verified</Badge>
                          ) : (
                            <Badge variant="neutral">Unverified</Badge>
                          )}
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ fontWeight: 600 }}>{dev.projectCount}</span> workspace(s)
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {dev.status === 'suspended' ? (
                          <Badge variant="danger" dot>Revoked / Suspended</Badge>
                        ) : (
                          <Badge variant="success" dot>Active</Badge>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(dev.createdAt).toLocaleDateString()}
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          {dev.status === 'active' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmStatusModal({ developer: dev, targetStatus: 'suspended' })}
                              disabled={dev.isPlatformAdmin}
                              title={dev.isPlatformAdmin ? 'Root admin accounts cannot be suspended' : 'Revoke developer access'}
                              style={{ color: 'var(--accent-red)' }}
                            >
                              <Lock size={13} style={{ marginRight: '4px' }} />
                              Revoke Access
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmStatusModal({ developer: dev, targetStatus: 'active' })}
                              style={{ color: 'var(--accent-emerald)' }}
                            >
                              <Unlock size={13} style={{ marginRight: '4px' }} />
                              Reactivate
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setResetPasswordModal(dev);
                              setTempPassword('');
                              setResetResult(null);
                            }}
                            title="Reset password and dispatch email to console developer"
                            style={{ color: 'var(--accent-blue)' }}
                          >
                            <KeyRound size={13} style={{ marginRight: '4px' }} />
                            Reset Password
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteDevModal(dev)}
                            disabled={dev.isPlatformAdmin}
                            title={dev.isPlatformAdmin ? 'Root admin accounts cannot be deleted' : 'Delete developer'}
                            style={{ color: 'var(--text-muted)' }}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: Tenant Projects Table */}
      {activeTab === 'projects' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Tenant Projects Directory</CardTitle>
                <CardDescription>
                  All project workspaces operating on this Syntrabase cluster with their assigned plans and document volumes.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Project &amp; Identifier</th>
                  <th style={{ padding: '12px 16px' }}>Owner Account</th>
                  <th style={{ padding: '12px 16px' }}>Plan Tier</th>
                  <th style={{ padding: '12px 16px' }}>Documents &amp; Storage</th>
                  <th style={{ padding: '12px 16px' }}>Cluster Status</th>
                  <th style={{ padding: '12px 16px' }}>Dedicated Brevo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Containment Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                      Loading projects from database...
                    </td>
                  </tr>
                ) : filteredProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No projects found matching &quot;{search}&quot;.
                    </td>
                  </tr>
                ) : (
                  filteredProjects.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                        <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {p.slug} • <span style={{ color: 'var(--accent-blue)' }}>{p.id.substring(0, 18)}...</span>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>
                        {p.ownerEmail}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <Badge variant={p.planSlug === 'enterprise' ? 'danger' : p.planSlug === 'pro' ? 'info' : 'outline'}>
                          {p.planName || 'Free Tier'}
                        </Badge>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                          {(Number(p.documentsCount) || 0).toLocaleString()} docs
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {formatBytes(p.storageBytes)} file storage
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        {p.status === 'suspended' ? (
                          <Badge variant="danger" dot>Suspended</Badge>
                        ) : (
                          <Badge variant="success" dot>Live Cluster</Badge>
                        )}
                      </td>

                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Badge variant={p.dedicatedBrevoEnabled ? 'success' : 'outline'} size="sm">
                            {p.dedicatedBrevoEnabled ? 'Enabled' : 'Disabled'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={togglingBrevoId === p.id}
                            onClick={() => handleToggleDedicatedBrevo(p)}
                            style={{ fontSize: '0.74rem', padding: '2px 8px' }}
                          >
                            {togglingBrevoId === p.id ? 'Saving...' : p.dedicatedBrevoEnabled ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      </td>

                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {p.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmProjectModal({ project: p, targetStatus: 'suspended' })}
                            style={{ color: 'var(--accent-red)' }}
                          >
                            <ShieldAlert size={13} style={{ marginRight: '4px' }} />
                            Suspend Tenant
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmProjectModal({ project: p, targetStatus: 'active' })}
                            style={{ color: 'var(--accent-emerald)' }}
                          >
                            <CheckCircle2 size={13} style={{ marginRight: '4px' }} />
                            Reactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Confirmation Modal: Developer Status */}
      {confirmStatusModal && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmStatusModal(null)}
          title={confirmStatusModal.targetStatus === 'suspended' ? 'Revoke Developer Access' : 'Reactivate Developer Access'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Are you sure you want to {confirmStatusModal.targetStatus === 'suspended' ? 'revoke access for' : 'reactivate'} developer{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{confirmStatusModal.developer.email}</strong>?
            </p>

            {confirmStatusModal.targetStatus === 'suspended' && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: '0.82rem',
                  color: '#f87171',
                }}
              >
                Suspending this developer will immediately terminate all active sessions and block sign-in to the Developer Console.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="ghost" onClick={() => setConfirmStatusModal(null)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                variant={confirmStatusModal.targetStatus === 'suspended' ? 'destructive' : 'primary'}
                onClick={handleToggleDeveloperStatus}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? 'Processing...'
                  : confirmStatusModal.targetStatus === 'suspended'
                  ? 'Confirm Suspension'
                  : 'Reactivate Account'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Delete Developer */}
      {deleteDevModal && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteDevModal(null)}
          title="Delete Developer Account"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Permanently delete developer account <strong style={{ color: 'var(--text-primary)' }}>{deleteDevModal.email}</strong>?
              This action cannot be undone and will delete their associated workspace records.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="ghost" onClick={() => setDeleteDevModal(null)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteDeveloper} disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal: Project Status */}
      {confirmProjectModal && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmProjectModal(null)}
          title={confirmProjectModal.targetStatus === 'suspended' ? 'Quarantine Project Workspace' : 'Restore Project Workspace'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              {confirmProjectModal.targetStatus === 'suspended'
                ? `Emergency Quarantine project workspace "${confirmProjectModal.project.name}" (${confirmProjectModal.project.id})? All incoming API traffic and document writes will be blocked.`
                : `Restore project workspace "${confirmProjectModal.project.name}" to active cluster traffic?`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button variant="ghost" onClick={() => setConfirmProjectModal(null)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                variant={confirmProjectModal.targetStatus === 'suspended' ? 'destructive' : 'primary'}
                onClick={handleToggleProjectStatus}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating...' : confirmProjectModal.targetStatus === 'suspended' ? 'Quarantine Project' : 'Activate Project'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Developer Password Reset Modal */}
      {resetPasswordModal && (
        <Modal
          isOpen={true}
          onClose={() => {
            setResetPasswordModal(null);
            setResetResult(null);
          }}
          title="Reset Developer Password & Dispatch Email"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 0' }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Initiate a secure credentials reset for developer account{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{resetPasswordModal.email}</strong>.
            </p>

            {resetResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid var(--accent-emerald)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', color: 'var(--accent-emerald)', fontWeight: 700, fontSize: '0.9rem' }}>
                    <CheckCircle2 size={16} />
                    <span>Credentials Reset Successfully</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                    {resetResult.mailDispatched
                      ? `Reset email with login instructions was dispatched to ${resetPasswordModal.email} via Brevo outbox gateway.`
                      : resetResult.message}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                      Temporary Generated Password:
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-blue)', background: 'var(--bg-main)', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', userSelect: 'all' }}>
                        {resetResult.temporaryPassword}
                      </code>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(resetResult.temporaryPassword);
                          addToast('Temporary password copied to clipboard', 'info');
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <Button variant="primary" onClick={() => { setResetPasswordModal(null); setResetResult(null); }}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                    CUSTOM TEMPORARY PASSWORD (LEAVE BLANK TO AUTO-GENERATE)
                  </label>
                  <Input
                    type="text"
                    placeholder="Auto-generate cryptographically secure key"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                  />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Existing sessions will be immediately terminated.
                  </span>
                </div>

                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Mail size={16} color="var(--accent-blue)" />
                  <span>Transactional reset notice will be sent automatically via the outbound mail system.</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <Button variant="ghost" onClick={() => setResetPasswordModal(null)} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleResetPassword} disabled={isSubmitting}>
                    {isSubmitting ? 'Resetting & Dispatching...' : 'Reset & Send Email'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
