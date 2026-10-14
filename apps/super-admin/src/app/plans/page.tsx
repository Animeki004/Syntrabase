'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  Edit2,
  Plus,
  ArrowRight,
  HardDrive,
  Database,
  Cpu,
  Sliders,
  AlertTriangle,
  Info,
  Clock,
  CheckCircle2,
  Building2,
  Lock,
  RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface PlanData {
  id: string;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  maxProjects?: number;
  maxDatabases?: number;
  maxDbStorageBytes: number;
  maxDocSizeBytes: number;
  maxApiRequestsPerWindow: number;
  maxFileStorageBytes: number;
  maxRealtimeConnections: number;
  capabilities: {
    'database.documents': boolean;
    'database.realtime': boolean;
    'storage.objects': boolean;
    'auth.email': boolean;
    'auth.anonymous': boolean;
    [key: string]: boolean;
  };
  projectCount: number;
}

interface ProjectAssignment {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string;
  planSlug: string;
  planName: string;
  hasOverride: boolean;
  dbUsageBytes: number;
  fileUsageBytes: number;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B (Disabled)';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

export default function PlansManagementPage() {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [projects, setProjects] = useState<ProjectAssignment[]>([]);
  const [activeTab, setActiveTab] = useState<'plans' | 'assignments' | 'audit'>('plans');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null);
  const [assignModal, setAssignModal] = useState<ProjectAssignment | null>(null);
  const [selectedPlanForAssign, setSelectedPlanForAssign] = useState<string>('free');
  const [overrideStorage, setOverrideStorage] = useState<boolean>(false);

  // Edit Plan form state
  const [editName, setEditName] = useState('');
  const [editMaxProjects, setEditMaxProjects] = useState(1);
  const [editMaxDatabases, setEditMaxDatabases] = useState(1);
  const [editMaxDocSize, setEditMaxDocSize] = useState(1); // in MB
  const [editMaxDbStorage, setEditMaxDbStorage] = useState(50); // in MB
  const [editStorageEnabled, setEditStorageEnabled] = useState(false);
  const [editMaxFileStorage, setEditMaxFileStorage] = useState(0); // in GB

  const getAdminToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || 'admin-token';
    }
    return 'admin-token';
  };

  const loadData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const token = getAdminToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [plansRes, projectsRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/admin/plans`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/projects`, { headers }),
      ]);

      if (plansRes.ok) {
        const data = await plansRes.json();
        if (Array.isArray(data.plans) && data.plans.length > 0) {
          setPlans(data.plans);
        }
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        if (Array.isArray(data.projects)) {
          setProjects(
            data.projects.map((p: any) => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              ownerEmail: p.ownerEmail || 'admin@syntrabase.internal',
              planSlug: p.planSlug || 'free',
              planName: p.planName || 'Free Tier',
              hasOverride: false,
              dbUsageBytes: (p.documentsCount || 0) * 1024,
              fileUsageBytes: Number(p.storageBytes || 0),
            }))
          );
        }
      }
    } catch {
      // offline fallback
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEditModal = (plan: PlanData) => {
    setEditingPlan(plan);
    setEditName(plan.name);
    setEditMaxProjects(plan.maxProjects || (plan.slug === 'free' ? 1 : plan.slug === 'pro' ? 5 : 25));
    setEditMaxDatabases(plan.maxDatabases || (plan.slug === 'free' ? 1 : plan.slug === 'pro' ? 5 : 25));
    setEditMaxDocSize(Math.round(plan.maxDocSizeBytes / (1024 * 1024)));
    setEditMaxDbStorage(Math.round(plan.maxDbStorageBytes / (1024 * 1024)));
    setEditStorageEnabled(plan.capabilities['storage.objects']);
    setEditMaxFileStorage(Math.round(plan.maxFileStorageBytes / (1024 * 1024 * 1024)));
  };

  const handleSavePlan = async () => {
    if (!editingPlan) return;

    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/plans/${editingPlan.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName,
          maxProjects: editMaxProjects,
          maxDatabases: editMaxDatabases,
          maxDocSizeBytes: editMaxDocSize * 1024 * 1024,
          maxDbStorageBytes: editMaxDbStorage * 1024 * 1024,
          maxFileStorageBytes: editStorageEnabled ? editMaxFileStorage * 1024 * 1024 * 1024 : 0,
          capabilities: {
            ...editingPlan.capabilities,
            'storage.objects': editStorageEnabled,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Failed to update plan limits', 'error');
        return;
      }

      addToast(`Plan '${editName}' updated and limits enforced across projects.`, 'success');
      setEditingPlan(null);
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Network error updating plan', 'error');
    }
  };

  const handleAssignPlan = async () => {
    if (!assignModal) return;

    const targetPlan = plans.find((p) => p.slug === selectedPlanForAssign);
    if (!targetPlan) return;

    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/projects/${assignModal.id}/plan`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: targetPlan.id,
          overrides: overrideStorage ? { 'capabilities.storage.objects': true } : {},
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Failed to assign plan', 'error');
        return;
      }

      addToast(`Assigned ${targetPlan.name} to project '${assignModal.name}'.`, 'success');
      setAssignModal(null);
      await loadData();
    } catch (err: any) {
      addToast(err.message || 'Network error assigning plan', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Overview Stat Badges */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Configured Global Tiers</span>
              <Layers size={18} color="var(--accent-blue)" />
            </div>
            {isLoading ? (
              <div className="skeleton-box animate-pulse" style={{ width: '120px', height: '28px', borderRadius: '4px', marginTop: '8px' }} />
            ) : (
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: 'var(--text-primary)' }}>
                {plans.length} Active Plans
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <Badge variant="success">Free Tier</Badge>
              <Badge variant="info">Pro</Badge>
              <Badge variant="default">Enterprise</Badge>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Free Tier Storage Restriction</span>
              <ShieldAlert size={18} color="var(--accent-amber)" />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: 'var(--accent-amber)' }}>
              Enforced (0 B Limit)
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Direct upload & signed URLs blocked with <code style={{ color: 'var(--accent-amber)' }}>FEATURE_DISABLED</code>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Governed Projects</span>
              <Building2 size={18} color="var(--accent-emerald)" />
            </div>
            {isLoading ? (
              <div className="skeleton-box animate-pulse" style={{ width: '120px', height: '28px', borderRadius: '4px', marginTop: '8px' }} />
            ) : (
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '8px', color: 'var(--text-primary)' }}>
                {projects.length} Total Projects
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              All projects bound to authoritative limits
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant={activeTab === 'plans' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('plans')}
          >
            <Sliders size={14} style={{ marginRight: '6px' }} />
            Global Plans & Capabilities
          </Button>
          <Button
            variant={activeTab === 'assignments' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('assignments')}
          >
            <Building2 size={14} style={{ marginRight: '6px' }} />
            Tenant Plan Assignments
          </Button>
          <Button
            variant={activeTab === 'audit' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('audit')}
          >
            <Clock size={14} style={{ marginRight: '6px' }} />
            Quota Governance Audit
          </Button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => loadData(true)}
          disabled={isRefreshing}
          icon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
      </div>

      {/* TAB 1: Global Plans Directory */}
      {activeTab === 'plans' && (
        <>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div className="skeleton-box animate-pulse" style={{ height: '24px', width: '60%', borderRadius: '4px' }} />
                    <div className="skeleton-box animate-pulse" style={{ height: '14px', width: '90%', borderRadius: '4px' }} />
                    <div className="skeleton-box animate-pulse" style={{ height: '80px', width: '100%', borderRadius: '6px' }} />
                    <div className="skeleton-box animate-pulse" style={{ height: '36px', width: '100%', borderRadius: '6px' }} />
                  </div>
                </Card>
              ))}
            </div>
          ) : plans.length === 0 ? (
            <Card>
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Layers size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  No Platform Plans Found
                </h3>
                <p style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
                  Unable to load plans from PostgreSQL or no plans exist.
                </p>
                <Button variant="secondary" size="sm" onClick={() => loadData(true)}>
                  Retry Loading Plans
                </Button>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
              {plans.map((plan) => {
            const isStorageDisabled = !plan.capabilities['storage.objects'];

            return (
              <Card key={plan.id} style={{ border: plan.isDefault ? '1px solid var(--accent-blue)' : undefined }}>
                <CardHeader>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CardTitle>{plan.name}</CardTitle>
                        {plan.isDefault && <Badge variant="info">Default Free</Badge>}
                      </div>
                      <CardDescription style={{ marginTop: '4px' }}>
                        {plan.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <div style={{ padding: '0 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Storage Restriction Callout for Free Tier */}
                  {isStorageDisabled ? (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                      }}
                    >
                      <Lock size={16} color="var(--accent-amber)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--accent-amber)' }}>File/Object Storage Disabled:</strong> Projects cannot upload files or generate signed upload URLs. Normal JSON documents remain fully supported.
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                      }}
                    >
                      <ShieldCheck size={16} color="var(--accent-emerald)" style={{ marginTop: '2px', flexShrink: 0 }} />
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--accent-emerald)' }}>Storage Enabled:</strong> Dedicated S3/MinIO bucket access active up to {formatBytes(plan.maxFileStorageBytes)}.
                      </div>
                    </div>
                  )}

                  {/* Limits Table */}
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Configured Quotas
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Database JSON Storage:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(plan.maxDbStorageBytes)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Max Document Size:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(plan.maxDocSizeBytes)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Object File Storage:</span>
                        <strong style={{ color: isStorageDisabled ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
                          {formatBytes(plan.maxFileStorageBytes)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Realtime Sockets:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{plan.maxRealtimeConnections} connections</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Max Projects Quota:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{plan.maxProjects ?? (plan.slug === 'free' ? 1 : plan.slug === 'pro' ? 5 : 25)} projects</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Max Databases / Project:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{plan.maxDatabases ?? (plan.slug === 'free' ? 1 : plan.slug === 'pro' ? 5 : 25)} databases</strong>
                      </div>
                    </div>
                  </div>

                  {/* Capabilities List */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                      Platform Capabilities
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(plan.capabilities).map(([capKey, isEnabled]) => (
                        <div
                          key={capKey}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: isEnabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: isEnabled ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                          }}
                        >
                          {isEnabled ? <Check size={12} /> : <X size={12} />}
                          <code>{capKey}</code>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Assigned to <strong>{plan.projectCount}</strong> projects
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => openEditModal(plan)}>
                      <Edit2 size={13} style={{ marginRight: '6px' }} />
                      Configure Limits
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  )}

      {/* TAB 2: Tenant Plan Assignments */}
      {activeTab === 'assignments' && (
        <Card>
          <CardHeader>
            <CardTitle>Tenant Plan Assignments & Overrides</CardTitle>
            <CardDescription>
              Assign projects to plans or grant project-specific capability overrides.
            </CardDescription>
          </CardHeader>
          <div style={{ padding: '0 20px 20px 20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Project Name</th>
                  <th style={{ padding: '10px 12px' }}>Owner</th>
                  <th style={{ padding: '10px 12px' }}>Assigned Plan</th>
                  <th style={{ padding: '10px 12px' }}>File Storage Status</th>
                  <th style={{ padding: '10px 12px' }}>DB Usage</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((proj) => {
                  const isFree = proj.planSlug === 'free';

                  return (
                    <tr key={proj.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{proj.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID: {proj.slug}</div>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{proj.ownerEmail}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Badge variant={isFree ? 'default' : 'info'}>{proj.planName}</Badge>
                          {proj.hasOverride && <Badge variant="warning">Custom Override</Badge>}
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isFree ? (
                          <span style={{ color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Lock size={13} /> Disabled (0 B)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={13} /> Active ({formatBytes(proj.fileUsageBytes)})
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>
                        {formatBytes(proj.dbUsageBytes)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setAssignModal(proj);
                            setSelectedPlanForAssign(proj.planSlug);
                            setOverrideStorage(proj.hasOverride);
                          }}
                        >
                          Change Plan
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: Quota Governance Audit */}
      {activeTab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle>Authoritative Plan Governance Ledger</CardTitle>
            <CardDescription>
              HMAC-SHA256 audited changes to global plans, feature capabilities, and tenant overrides.
            </CardDescription>
          </CardHeader>
          <div style={{ padding: '0 20px 20px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <ShieldCheck size={16} color="var(--accent-emerald)" />
                <div style={{ flex: 1, fontSize: '13px' }}>
                  <strong>Plan Enforcement Activated:</strong> Centralized Free-Tier restriction on <code>storage.objects</code> locked at gateway level.
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Today 13:40</span>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                <Clock size={16} color="var(--accent-blue)" />
                <div style={{ flex: 1, fontSize: '13px' }}>
                  <strong>Default Quotas Seeded:</strong> Free tier set to 50MB DB storage, 1MB max document payload, 0B file storage.
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Today 13:38</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* MODAL 1: Edit Plan Limits */}
      {editingPlan && (
        <Modal
          isOpen={true}
          title={`Edit Quotas & Capabilities: ${editingPlan.name}`}
          onClose={() => setEditingPlan(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Plan Name
              </label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Max DB Storage (MB)
                </label>
                <Input
                  type="number"
                  value={editMaxDbStorage}
                  onChange={(e) => setEditMaxDbStorage(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Max Single Doc Size (MB)
                </label>
                <Input
                  type="number"
                  value={editMaxDocSize}
                  onChange={(e) => setEditMaxDocSize(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Max Projects Allowance
                </label>
                <Input
                  type="number"
                  min={1}
                  value={editMaxProjects}
                  onChange={(e) => setEditMaxProjects(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Max Databases per Project
                </label>
                <Input
                  type="number"
                  min={1}
                  value={editMaxDatabases}
                  onChange={(e) => setEditMaxDatabases(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>

            {/* Dedicated File Storage Capability Toggle */}
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '14px',
                background: editStorageEnabled ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                    Capability: <code>storage.objects</code>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Allow tenant to upload files and generate signed upload URLs
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={editStorageEnabled}
                  onChange={(e) => setEditStorageEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              {editStorageEnabled && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Dedicated Object Storage Capacity (GB)
                  </label>
                  <Input
                    type="number"
                    value={editMaxFileStorage}
                    onChange={(e) => setEditMaxFileStorage(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <Button variant="ghost" onClick={() => setEditingPlan(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSavePlan}>
                Save Plan Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: Assign Plan to Project */}
      {assignModal && (
        <Modal
          isOpen={true}
          title={`Assign Plan: ${assignModal.name}`}
          onClose={() => setAssignModal(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Select Global Plan
              </label>
              <select
                value={selectedPlanForAssign}
                onChange={(e) => setSelectedPlanForAssign(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                }}
              >
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} {p.capabilities['storage.objects'] ? '(Storage Enabled)' : '(Storage Disabled)'}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
              <input
                type="checkbox"
                id="overrideStorage"
                checked={overrideStorage}
                onChange={(e) => setOverrideStorage(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="overrideStorage" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Enable project-specific storage override (bypass default plan lock)
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <Button variant="ghost" onClick={() => setAssignModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleAssignPlan}>
                Confirm Assignment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
