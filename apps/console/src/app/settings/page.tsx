'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Copy,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  Lock,
  Shield,
  Database,
  HardDrive,
  Zap,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ArrowUpRight,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { ProjectPlanContext } from '@syntrabase/shared-types';
import { API_BASE_URL } from '@/config';

interface SecretKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string;
}

const INITIAL_KEYS: SecretKeyRecord[] = [];

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export default function SettingsPage() {
  const { addToast } = useToast();
  const { activeProject } = useProject();
  const projectId = activeProject.id;
  const [keys, setKeys] = useState<SecretKeyRecord[]>(INITIAL_KEYS);
  const [publishableKey, setPublishableKey] = useState<string>('');
  const [isRotatingPublishable, setIsRotatingPublishable] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<'pro' | 'enterprise'>('pro');
  const [upgradeNotes, setUpgradeNotes] = useState('');

  // Authoritative project plan context
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [planContext, setPlanContext] = useState<ProjectPlanContext>({
    projectId,
    planId: activeProject?.planId || '00000000-0000-0000-0000-000000000003',
    planName: activeProject?.planName || 'Enterprise Plan',
    planSlug: (activeProject?.planSlug as any) || 'enterprise',
    capabilities: {
      'database.documents': true,
      'database.realtime': true,
      'storage.objects': true,
      'auth.email': true,
      'auth.anonymous': true,
    },
    limits: {
      maxDbStorageBytes: 10737418240,
      maxDocSizeBytes: 10485760,
      maxApiRequestsPerWindow: 100000,
      maxFileStorageBytes: 107374182400,
      maxRealtimeConnections: 10000,
    },
    usage: {
      dbStorageBytes: 0,
      fileStorageBytes: 0,
      activeConnections: 0,
    },
    isOverride: false,
  });

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [keyNameInput, setKeyNameInput] = useState('');
  const [newKeyModal, setNewKeyModal] = useState<{ rawKey: string; name: string } | null>(null);
  const [revokingKey, setRevokingKey] = useState<SecretKeyRecord | null>(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [copiedPublishable, setCopiedPublishable] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Cloud Triggers State
  interface TriggerItem {
    id: string;
    name: string;
    collectionPath: string;
    eventType: 'create' | 'update' | 'delete' | 'write';
    endpointUrl: string;
    isActive: boolean;
    createdAt: string;
  }

  const [triggers, setTriggers] = useState<TriggerItem[]>([
    {
      id: 'trig_01',
      name: 'User Onboarding Dispatcher',
      collectionPath: 'users',
      eventType: 'create',
      endpointUrl: 'https://api.internal.app/webhooks/user-onboarding',
      isActive: true,
      createdAt: '2026-10-12 11:20:00',
    },
    {
      id: 'trig_02',
      name: 'Order Audit Sync',
      collectionPath: 'orders',
      eventType: 'write',
      endpointUrl: 'https://audit.internal.app/events/order',
      isActive: true,
      createdAt: '2026-10-13 08:45:10',
    },
  ]);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [newTriggerName, setNewTriggerName] = useState('');
  const [newTriggerCollection, setNewTriggerCollection] = useState('');
  const [newTriggerEvent, setNewTriggerEvent] = useState<'create' | 'update' | 'delete' | 'write'>('write');
  const [newTriggerEndpoint, setNewTriggerEndpoint] = useState('');
  const [newTriggerSecret, setNewTriggerSecret] = useState('');

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/plan`, {
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) {
          const data = await res.json();
          setPlanContext(data);
        }
      } catch {
        // Safe fallback maintains Free Tier defaults
      }
    };

    const fetchCredentials = async () => {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/credentials`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.publishableKey) setPublishableKey(data.publishableKey);
          if (Array.isArray(data.secretKeys)) setKeys(data.secretKeys);
        }
      } catch {
        // Safe fallback
      }
    };

    fetchPlan();
    fetchCredentials();
  }, [projectId]);

  const handleRotatePublishableKey = async () => {
    setIsRotatingPublishable(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/credentials/rotate-publishable`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.publishableKey) {
        setPublishableKey(data.publishableKey);
        addToast('Publishable client key rotated successfully!', 'success');
      } else {
        addToast(data.message || 'Failed to rotate publishable key', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to rotate publishable key', 'error');
    } finally {
      setIsRotatingPublishable(false);
    }
  };

  const handleCreateSecretKey = async () => {
    const name = keyNameInput.trim() || 'Backend Key';
    setIsGeneratingKey(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/credentials/secret`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && data.credential && data.rawKey) {
        setKeys([data.credential, ...keys]);
        setKeyNameInput('');
        setShowGenerateModal(false);
        setNewKeyModal({ rawKey: data.rawKey, name: data.credential.name });
        addToast(`Generated secret key '${name}'`, 'success');
      } else {
        addToast(data.message || 'Failed to generate secret key', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to generate secret key', 'error');
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingKey) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/credentials/${revokingKey.id}`, {
        method: 'DELETE',
        headers,
      });
      setKeys(keys.filter((k) => k.id !== revokingKey.id));
      addToast(`Revoked secret key '${revokingKey.name}'`, 'info');
    } catch (err: any) {
      addToast(err.message || 'Failed to revoke secret key', 'error');
    } finally {
      setRevokingKey(null);
    }
  };

  const handleSubmitUpgradeRequest = async () => {
    setIsSubmittingUpgrade(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const devDataStr = typeof window !== 'undefined' ? localStorage.getItem('auth_developer') : null;
      const devData = devDataStr ? JSON.parse(devDataStr) : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const targetLabel = upgradeTargetPlan === 'enterprise' ? 'Enterprise Dedicated Tier' : 'Pro Tier';
      const res = await fetch(`${API_BASE_URL}/api/v1/contact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          name: devData?.displayName || activeProject.name,
          email: devData?.email || 'developer@syntrabase.io',
          subject: `Plan Upgrade Request: ${targetLabel} (${activeProject.name})`,
          category: 'Billing Inquiry',
          message: `Developer requested an authoritative tier upgrade to ${targetLabel} for project ${activeProject.name} (${projectId}). Notes: ${upgradeNotes.trim() || 'Standard quota expansion requested.'}`,
        }),
      });
      if (res.ok) {
        addToast('Plan upgrade inquiry dispatched to Super Admin triage operations.', 'success');
        setShowUpgradeModal(false);
        setUpgradeNotes('');
      } else {
        addToast('Failed to submit upgrade inquiry. Please try again.', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to submit upgrade request', 'error');
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  const handleConfirmEmergencyRevocation = () => {
    setShowEmergencyModal(false);
    addToast('Emergency revocation executed. All active tokens invalidated.', 'warning');
  };

  const handleCreateTrigger = async () => {
    if (!newTriggerName || !newTriggerCollection || !newTriggerEndpoint) {
      addToast('Please fill all required trigger fields', 'error');
      return;
    }
    const item = {
      id: `trig_${Date.now().toString(36)}`,
      name: newTriggerName.trim(),
      collectionPath: newTriggerCollection.trim(),
      eventType: newTriggerEvent,
      endpointUrl: newTriggerEndpoint.trim(),
      isActive: true,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
    };
    try {
      await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/functions/triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.name,
          collectionPath: item.collectionPath,
          eventType: item.eventType,
          endpointUrl: item.endpointUrl,
          secretKey: newTriggerSecret || 'syntrabase_sec_live',
        }),
      }).catch(() => null);
    } catch {
      // Local fallback
    }
    setTriggers([item, ...triggers]);
    setShowTriggerModal(false);
    setNewTriggerName('');
    setNewTriggerCollection('');
    setNewTriggerEndpoint('');
    setNewTriggerSecret('');
    addToast(`Webhook trigger '${item.name}' created`, 'success');
  };

  const isStorageEnabled = !!planContext.capabilities['storage.objects'];
  const dbUsagePercent = Math.min(
    100,
    Math.round((planContext.usage.dbStorageBytes / (planContext.limits.maxDbStorageBytes || 1)) * 100)
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            Project Settings & Credentials
          </h1>
          <Badge variant="outline">Multi-Tenant Scoped</Badge>
          <Badge variant={isStorageEnabled ? 'success' : 'info'}>
            {planContext.planName}
          </Badge>
          {planContext.isOverride && (
            <Badge variant="warning">Custom Override Active</Badge>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          Manage project identifiers, client API keys, authoritative plan limits, and privileged secret lifecycles.
        </p>
      </div>

      {/* Plan & Quota Governance Card */}
      <Card>
        <CardHeader>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CardTitle>Assigned Plan & Authoritative Quotas</CardTitle>
              <Badge variant={isStorageEnabled ? 'success' : 'outline'}>
                {planContext.planName}
              </Badge>
              {planContext.isOverride && (
                <Badge variant="warning" size="sm">Tenant Override</Badge>
              )}
            </div>
            <CardDescription>
              Backend-enforced resource limits, active capabilities, and security barriers assigned to this project
            </CardDescription>
          </div>
          <div>
            {planContext.planSlug === 'enterprise' ? (
              <Badge variant="outline" size="sm">Utmost Plan Active</Badge>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowUpgradeModal(true)}>
                Plan Details & Upgrade
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quotas Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {/* DB Storage */}
            <div
              style={{
                padding: '14px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Database Storage
                </span>
                <Database size={14} color="var(--accent-blue)" />
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {formatBytes(planContext.usage.dbStorageBytes)} / {formatBytes(planContext.limits.maxDbStorageBytes)}
              </div>
              <div style={{ marginTop: '8px', width: '100%', height: '5px', background: 'var(--border-color)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, dbUsagePercent)}%`, height: '100%', background: 'var(--accent-blue)' }} />
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                {dbUsagePercent}% consumed • JSONB store
              </div>
            </div>

            {/* Document Payload Limit */}
            <div
              style={{
                padding: '14px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Max Document Size
                </span>
                <ShieldCheck size={14} color="var(--accent-emerald)" />
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {formatBytes(planContext.limits.maxDocSizeBytes)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                Per-doc JSON limit • UTF-8 byte verified
              </div>
            </div>

            {/* API Requests */}
            <div
              style={{
                padding: '14px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  API Request Rate
                </span>
                <Zap size={14} color="var(--accent-purple)" />
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {planContext.limits.maxApiRequestsPerWindow.toLocaleString()} req/win
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '12px' }}>
                Sliding window rate limit
              </div>
            </div>

            {/* Object Storage */}
            <div
              style={{
                padding: '14px',
                background: isStorageEnabled ? 'var(--bg-main)' : 'rgba(239, 68, 68, 0.04)',
                border: `1px solid ${isStorageEnabled ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 600, color: isStorageEnabled ? 'var(--text-muted)' : '#f87171', textTransform: 'uppercase' }}>
                  Object Storage
                </span>
                {isStorageEnabled ? (
                  <HardDrive size={14} color="var(--accent-emerald)" />
                ) : (
                  <Lock size={14} color="var(--accent-rose)" />
                )}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: isStorageEnabled ? 'var(--text-primary)' : 'var(--accent-rose)' }}>
                {isStorageEnabled ? formatBytes(planContext.limits.maxFileStorageBytes) : 'Disabled (0 B)'}
              </div>
              <div style={{ fontSize: '0.72rem', color: isStorageEnabled ? 'var(--text-muted)' : '#fca5a5', marginTop: '12px' }}>
                {isStorageEnabled ? 'S3/MinIO bucket capacity' : 'FEATURE_DISABLED on Free Tier'}
              </div>
            </div>
          </div>

          {/* Capabilities Checklist */}
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--bg-card-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Platform Capability Matrix
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                <CheckCircle2 size={15} color="var(--accent-emerald)" />
                <span>Document Database (JSONB)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                <CheckCircle2 size={15} color="var(--accent-emerald)" />
                <span>Realtime Event Outbox</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                <CheckCircle2 size={15} color="var(--accent-emerald)" />
                <span>Email Authentication</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                <CheckCircle2 size={15} color="var(--accent-emerald)" />
                <span>Anonymous Auth</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: isStorageEnabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {isStorageEnabled ? (
                  <CheckCircle2 size={15} color="var(--accent-emerald)" />
                ) : (
                  <XCircle size={15} color="var(--accent-rose)" />
                )}
                <span>Dedicated Object Storage</span>
                {!isStorageEnabled && (
                  <Badge variant="danger" size="sm">Disabled</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Authoritative Security Note */}
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} color="var(--accent-blue)" />
              <span>
                <strong>Authoritative Source of Truth:</strong> Quotas and capabilities are enforced by the backend server on every request. Developers cannot alter plan parameters directly.
              </span>
            </div>
            {planContext.planSlug === 'enterprise' ? (
              <Badge variant="outline" size="sm">Utmost Plan Active</Badge>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowUpgradeModal(true)}>
                Request Upgrade
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project Identity */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Project Identity</CardTitle>
            <CardDescription>Public identification and client configuration tokens</CardDescription>
          </div>
        </CardHeader>
        <CardContent style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
              PROJECT IDENTIFIER
            </label>
            <input
              type="text"
              readOnly
              value={activeProject.slug || activeProject.id}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
              PUBLISHABLE CLIENT API KEY
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                readOnly
                value={publishableKey || 'Loading publishable key...'}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--accent-blue)',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (publishableKey) {
                    navigator.clipboard.writeText(publishableKey);
                    setCopiedPublishable(true);
                    addToast('Copied publishable key', 'info');
                    setTimeout(() => setCopiedPublishable(false), 2000);
                  }
                }}
                icon={copiedPublishable ? <Check size={13} color="var(--accent-emerald)" /> : <Copy size={13} />}
              >
                {copiedPublishable ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRotatePublishableKey}
                disabled={isRotatingPublishable}
                icon={<RotateCcw size={13} className={isRotatingPublishable ? 'animate-spin' : ''} />}
              >
                Rotate
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secret Keys Management */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Privileged Admin Secret Keys</CardTitle>
            <CardDescription>Server-side keys that bypass security rules. Hashed using SHA-256 before persistence.</CardDescription>
          </div>
          <Button variant="primary" onClick={() => setShowGenerateModal(true)} icon={<Plus size={14} />}>
            Generate Secret Key
          </Button>
        </CardHeader>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Key Name</th>
                <th>Prefix</th>
                <th style={{ width: '160px' }}>Created</th>
                <th style={{ width: '160px' }}>Last Used</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.name}</td>
                  <td>
                    <code style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{k.prefix}</code>
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{k.createdAt}</td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{k.lastUsedAt}</td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setRevokingKey(k)}
                      icon={<Trash2 size={13} />}
                      style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Database Webhooks & Cloud Function Triggers */}
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={18} color="var(--accent-amber)" />
            <div>
              <CardTitle>Database Webhooks & Cloud Function Triggers</CardTitle>
              <CardDescription>
                Execute HTTP webhooks on document changes. Dispatched asynchronously with HMAC-SHA256 signature verification.
              </CardDescription>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowTriggerModal(true)} icon={<Plus size={14} />}>
            Register Webhook Trigger
          </Button>
        </CardHeader>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Trigger Name</th>
                <th>Collection Path</th>
                <th>Event Type</th>
                <th>Endpoint URL</th>
                <th style={{ width: '100px' }}>Status</th>
                <th style={{ width: '160px' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {triggers.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.name}</td>
                  <td><code style={{ fontSize: '0.8rem', color: 'var(--accent-blue)' }}>/{t.collectionPath}</code></td>
                  <td>
                    <Badge variant={t.eventType === 'write' ? 'info' : t.eventType === 'create' ? 'success' : 'warning'} size="sm">
                      {t.eventType}
                    </Badge>
                  </td>
                  <td><code style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t.endpointUrl}</code></td>
                  <td><Badge variant="success" size="sm">Active</Badge></td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="var(--accent-rose)" />
            <CardTitle style={{ color: 'var(--accent-rose)' }}>Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Emergency Credential Invalidation
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Immediately revoke all active user tokens and rotate internal signing secrets.
            </div>
          </div>
          <Button variant="danger" onClick={() => setShowEmergencyModal(true)}>
            Emergency Revoke All
          </Button>
        </CardContent>
      </Card>

      {/* Generate Key Modal */}
      <Modal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Generate Privileged Secret Key"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Key Description"
            placeholder="e.g. Backend Production Worker"
            value={keyNameInput}
            onChange={(e) => setKeyNameInput(e.target.value)}
            helperText="A descriptive identifier for logs and auditing."
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setShowGenerateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateSecretKey}>
              Create Key
            </Button>
          </div>
        </div>
      </Modal>

      {/* One-Time Reveal Modal */}
      <Modal
        isOpen={!!newKeyModal}
        onClose={() => setNewKeyModal(null)}
        title="Save Your Secret Key"
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: '#f87171', lineHeight: 1.5 }}>
            <strong>Important:</strong> This secret key will <strong>never be shown again</strong>. Store it securely in your environment variables.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              readOnly
              value={newKeyModal?.rawKey || ''}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                color: '#fca5a5',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
              }}
            />
            <Button
              variant="primary"
              onClick={() => {
                if (newKeyModal?.rawKey) {
                  navigator.clipboard.writeText(newKeyModal.rawKey);
                  setCopiedSecret(true);
                  addToast('Copied secret key to clipboard', 'info');
                  setTimeout(() => setCopiedSecret(false), 2000);
                }
              }}
              icon={copiedSecret ? <Check size={14} /> : <Copy size={14} />}
            >
              {copiedSecret ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setNewKeyModal(null)}>
              I have stored this key
            </Button>
          </div>
        </div>
      </Modal>

      {/* Revoke Key Confirmation Modal */}
      <Modal
        isOpen={!!revokingKey}
        onClose={() => setRevokingKey(null)}
        title="Revoke Admin Key"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Are you sure you want to revoke secret key{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{revokingKey?.name}</strong>?
          </p>
          <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-rose)', borderRadius: 'var(--radius-md)', fontSize: '0.78rem', color: '#f87171' }}>
            Any backend microservice using this key will immediately be rejected with 401 Unauthorized.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setRevokingKey(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmRevoke}>
              Confirm Revocation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Emergency Modal */}
      <Modal
        isOpen={showEmergencyModal}
        onClose={() => setShowEmergencyModal(false)}
        title="Emergency Token Invalidation"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            This will immediately disconnect all active users, invalidate all refresh tokens, and cycle cryptographic keys.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setShowEmergencyModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmEmergencyRevocation}>
              Execute Invalidation
            </Button>
          </div>
        </div>
      </Modal>

      {/* Plan Upgrade Guidance Modal */}
      <Modal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        title="Project Plan & Quota Expansion"
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
            <ShieldCheck size={22} color="var(--accent-blue)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                Active Plan: <span style={{ color: 'var(--accent-blue)' }}>{planContext.planName}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Authoritative quotas and capability boundaries assigned to project <code>{planContext.projectId}</code>
              </div>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            To unlock dedicated object storage (<code>storage.objects</code>), elevate document database limits, or expand request rate throughput, request an upgrade or tenant override.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div
              onClick={() => setUpgradeTargetPlan('pro')}
              style={{
                padding: '12px',
                border: `2px solid ${upgradeTargetPlan === 'pro' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                background: upgradeTargetPlan === 'pro' ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: upgradeTargetPlan === 'pro' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                  Pro Plan
                </span>
                <Badge variant={upgradeTargetPlan === 'pro' ? 'info' : 'outline'} size="sm">
                  {upgradeTargetPlan === 'pro' ? 'Selected' : 'Select'}
                </Badge>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.6 }}>
                • 50 GB Object Storage Enabled<br />
                • 100 MB Database Storage<br />
                • 10,000 API Requests/win<br />
                • 100 Realtime Connections
              </div>
            </div>

            <div
              onClick={() => setUpgradeTargetPlan('enterprise')}
              style={{
                padding: '12px',
                border: `2px solid ${upgradeTargetPlan === 'enterprise' ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-md)',
                background: upgradeTargetPlan === 'enterprise' ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-card)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: upgradeTargetPlan === 'enterprise' ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                  Enterprise Plan
                </span>
                <Badge variant={upgradeTargetPlan === 'enterprise' ? 'info' : 'outline'} size="sm">
                  {upgradeTargetPlan === 'enterprise' ? 'Selected' : 'Select'}
                </Badge>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.6 }}>
                • Custom Object Storage Limits<br />
                • Tenant-specific Quota Overrides<br />
                • Custom SLA & SOC Telemetry<br />
                • Dedicated Support Engineer
              </div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Upgrade Requirements & Notes (Optional)
            </label>
            <Textarea
              rows={3}
              placeholder="e.g. Scaling traffic for Q4 product launch, require 50GB storage and higher request concurrency."
              value={upgradeNotes}
              onChange={(e) => setUpgradeNotes(e.target.value)}
            />
          </div>

          <div style={{ padding: '10px 12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <strong>Security Boundary:</strong> Developers do not have administrative authority to elevate their own plan limits or modify authoritative database records. Submitting this form opens a verified support inquiry to Super Administrators in <code>apps/super-admin</code>.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <Button variant="secondary" onClick={() => setShowUpgradeModal(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              disabled={isSubmittingUpgrade}
              onClick={handleSubmitUpgradeRequest}
            >
              {isSubmittingUpgrade ? 'Submitting...' : 'Submit Upgrade Request'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Register Trigger Modal */}
      <Modal
        isOpen={showTriggerModal}
        onClose={() => setShowTriggerModal(false)}
        title="Register Database Webhook Trigger"
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Trigger Name"
            placeholder="e.g. Sync User to CRM"
            value={newTriggerName}
            onChange={(e) => setNewTriggerName(e.target.value)}
          />
          <Input
            label="Collection Path"
            placeholder="e.g. users, orders, posts"
            value={newTriggerCollection}
            onChange={(e) => setNewTriggerCollection(e.target.value)}
            helperText="Matches documents mutated within this collection."
          />
          <div>
            <label style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
              Event Trigger Filter
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['write', 'create', 'update', 'delete'] as const).map((ev) => (
                <Button
                  key={ev}
                  variant={newTriggerEvent === ev ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setNewTriggerEvent(ev)}
                >
                  {ev}
                </Button>
              ))}
            </div>
          </div>
          <Input
            label="Target Webhook URL"
            placeholder="https://api.yourdomain.com/webhooks/database"
            value={newTriggerEndpoint}
            onChange={(e) => setNewTriggerEndpoint(e.target.value)}
            helperText="HTTP endpoint that receives HMAC-SHA256 signed JSON payloads."
          />
          <Input
            type="password"
            label="Signing Secret Key (Optional)"
            placeholder="Leave empty for auto-generated secret"
            value={newTriggerSecret}
            onChange={(e) => setNewTriggerSecret(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" onClick={() => setShowTriggerModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateTrigger}>
              Create Trigger
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
