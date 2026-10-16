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
  RotateCcw,
  Fingerprint,
  Smartphone,
  QrCode,
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
  const { activeProject, deleteProject } = useProject();
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
  const [planContext, setPlanContext] = useState<ProjectPlanContext | null>(null);

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [keyNameInput, setKeyNameInput] = useState('');
  const [newKeyModal, setNewKeyModal] = useState<{ rawKey: string; name: string } | null>(null);
  const [revokingKey, setRevokingKey] = useState<SecretKeyRecord | null>(null);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Project Deletion State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  const isDefaultProject = activeProject.id === '00000000-0000-0000-0000-000000000020' || activeProject.slug === 'default-project' || activeProject.slug === 'default';

  const handleDeleteProject = async () => {
    if (!deleteConfirmationInput || deleteConfirmationInput.trim().toLowerCase() !== activeProject.name.trim().toLowerCase()) {
      addToast(`Please type "${activeProject.name}" exactly to confirm deletion`, 'error');
      return;
    }
    setIsDeletingProject(true);
    try {
      const ok = await deleteProject(activeProject.id, deleteConfirmationInput.trim());
      if (ok) {
        setShowDeleteModal(false);
        setDeleteConfirmationInput('');
        if (typeof window !== 'undefined') {
          window.location.href = '/';
        }
      }
    } finally {
      setIsDeletingProject(false);
    }
  };

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

  const [triggers, setTriggers] = useState<TriggerItem[]>([]);
  const [isLoadingTriggers, setIsLoadingTriggers] = useState(false);
  const [isCreatingTrigger, setIsCreatingTrigger] = useState(false);
  const [deletingTriggerId, setDeletingTriggerId] = useState<string | null>(null);
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [newTriggerName, setNewTriggerName] = useState('');
  const [newTriggerCollection, setNewTriggerCollection] = useState('');
  const [newTriggerEvent, setNewTriggerEvent] = useState<'create' | 'update' | 'delete' | 'write'>('write');
  const [newTriggerEndpoint, setNewTriggerEndpoint] = useState('');
  const [newTriggerSecret, setNewTriggerSecret] = useState('');

  // ---------------------------------------------------------------------------
  // Developer Multi-Factor Authentication & Passkeys State
  // ---------------------------------------------------------------------------
  const [devTotpEnrolled, setDevTotpEnrolled] = useState(false);
  const [devPasskeys, setDevPasskeys] = useState<any[]>([]);
  const [isLoadingDevMfa, setIsLoadingDevMfa] = useState(false);

  // TOTP Enrollment Modal State
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [totpEnrollmentData, setTotpEnrollmentData] = useState<{
    secret: string;
    otpauthUrl: string;
    backupCodes: string[];
    qrCodeUrl?: string;
  } | null>(null);
  const [totpVerificationCode, setTotpVerificationCode] = useState('');
  const [isActivatingTotp, setIsActivatingTotp] = useState(false);
  const [totpActivatedSuccessfully, setTotpActivatedSuccessfully] = useState(false);

  // Passkey Registration Modal State
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyDeviceName, setPasskeyDeviceName] = useState('My Workstation Key');
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);

  const fetchDeveloperMfaStatus = async () => {
    setIsLoadingDevMfa(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/mfa/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDevTotpEnrolled(Boolean(data.totpEnrolled));
        setDevPasskeys(data.passkeys || []);
      }
    } catch {
      // Safe fallback
    } finally {
      setIsLoadingDevMfa(false);
    }
  };

  const handleStartTotpEnrollment = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) {
        addToast('Authentication session required', 'error');
        return;
      }
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/mfa/totp/enroll`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to initialize TOTP enrollment');
      }
      const data = await res.json();
      setTotpEnrollmentData(data);
      setTotpVerificationCode('');
      setTotpActivatedSuccessfully(false);
      setShowTotpModal(true);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleConfirmTotpActivation = async () => {
    if (!totpVerificationCode.trim()) {
      addToast('Please enter the 6-digit verification code from your authenticator app', 'error');
      return;
    }
    setIsActivatingTotp(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/mfa/totp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token: totpVerificationCode.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Invalid verification code');
      }
      setTotpActivatedSuccessfully(true);
      setDevTotpEnrolled(true);
      addToast('Authenticator app activated successfully!', 'success');
      await fetchDeveloperMfaStatus();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsActivatingTotp(false);
    }
  };

  const handleDisableTotp = async () => {
    if (!confirm('Are you sure you want to disable your Authenticator App MFA? Your account will be less secure.')) {
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/mfa/totp`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDevTotpEnrolled(false);
        addToast('Authenticator App MFA has been disabled.', 'info');
        await fetchDeveloperMfaStatus();
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleRegisterPasskey = async () => {
    setIsRegisteringPasskey(true);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      if (!token) throw new Error('Authentication session required');

      const optRes = await fetch(`${API_BASE_URL}/api/v1/auth/developer/passkeys/register/options`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!optRes.ok) {
        const err = await optRes.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to obtain passkey registration options');
      }
      const options = await optRes.json();

      const regResponse = await startRegistration({ optionsJSON: options as any });

      const verifyRes = await fetch(`${API_BASE_URL}/api/v1/auth/developer/passkeys/register/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          response: regResponse,
          deviceName: passkeyDeviceName.trim() || 'Developer Hardware Key',
        }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.message || 'Passkey attestation verification failed on server');
      }

      addToast('Passkey registered successfully! You can now use passwordless sign-in.', 'success');
      setShowPasskeyModal(false);
      setPasskeyDeviceName('My Workstation Key');
      await fetchDeveloperMfaStatus();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!confirm('Are you sure you want to delete this passkey?')) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/developer/passkeys/${passkeyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        addToast('Passkey deleted successfully', 'info');
        await fetchDeveloperMfaStatus();
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  useEffect(() => {
    const fetchPlan = async () => {
      setIsPlanLoading(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/plan`, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          setPlanContext(data);
        }
      } catch {
        // Safe fallback maintains defaults
      } finally {
        setIsPlanLoading(false);
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

    const fetchTriggers = async () => {
      setIsLoadingTriggers(true);
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/functions/triggers`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.triggers)) {
            setTriggers(data.triggers);
          }
        }
      } catch {
        // Safe fallback
      } finally {
        setIsLoadingTriggers(false);
      }
    };

    fetchPlan();
    fetchCredentials();
    fetchTriggers();
    fetchDeveloperMfaStatus();
  }, [projectId]);

  const reloadTriggers = async () => {
    if (!projectId) return;
    setIsLoadingTriggers(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/functions/triggers`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.triggers)) {
          setTriggers(data.triggers);
        }
      }
    } catch {
      // Safe fallback
    } finally {
      setIsLoadingTriggers(false);
    }
  };

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
      const rawKey = data.rawKey || data.key?.secretKeyPlain;
      const credential = data.credential || data.key;
      if (res.ok && rawKey && credential) {
        setKeys([credential, ...keys]);
        setKeyNameInput('');
        setShowGenerateModal(false);
        setNewKeyModal({ rawKey, name: credential.name });
        addToast(`Generated secret key '${name}'`, 'success');
      } else {
        addToast(data.message || data.error || 'Failed to generate secret key', 'error');
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
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/contact`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          projectId,
          name: devData?.displayName || activeProject.name,
          email: devData?.email || 'developer@example.com',
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
        const errData = await res.json().catch(() => ({}));
        addToast(errData.message || errData.error || 'Failed to submit upgrade inquiry. Please try again.', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Failed to submit upgrade request', 'error');
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  const handleConfirmEmergencyRevocation = async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/credentials/emergency-revoke`, {
        method: 'POST',
        headers,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.newPublishableKey) setPublishableKey(data.newPublishableKey);
        setKeys([]);
        addToast('Emergency revocation executed! All existing API keys and user sessions invalidated.', 'warning');
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Emergency revocation failed on server', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Emergency revocation network failure', 'error');
    } finally {
      setShowEmergencyModal(false);
    }
  };

  const handleCreateTrigger = async () => {
    if (!newTriggerName.trim() || !newTriggerCollection.trim() || !newTriggerEndpoint.trim()) {
      addToast('Please fill all required trigger fields', 'error');
      return;
    }
    setIsCreatingTrigger(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/functions/triggers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newTriggerName.trim(),
          collectionPath: newTriggerCollection.trim(),
          eventType: newTriggerEvent,
          endpointUrl: newTriggerEndpoint.trim(),
          ...(newTriggerSecret.trim() ? { secretKey: newTriggerSecret.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to register webhook trigger');
      }

      const data = await res.json();
      if (data.trigger) {
        setTriggers((prev) => [data.trigger, ...prev.filter((t) => t.id !== data.trigger.id)]);
      } else {
        await reloadTriggers();
      }

      setShowTriggerModal(false);
      setNewTriggerName('');
      setNewTriggerCollection('');
      setNewTriggerEndpoint('');
      setNewTriggerSecret('');
      addToast(`Webhook trigger '${newTriggerName.trim()}' successfully registered`, 'success');
    } catch (err: any) {
      addToast(err.message || 'Error registering webhook trigger', 'error');
    } finally {
      setIsCreatingTrigger(false);
    }
  };

  const handleDeleteTrigger = async (triggerId: string, triggerName: string) => {
    if (!confirm(`Are you sure you want to delete trigger "${triggerName}"?`)) {
      return;
    }
    setDeletingTriggerId(triggerId);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/functions/triggers/${triggerId}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || 'Failed to delete trigger');
      }

      setTriggers((prev) => prev.filter((t) => t.id !== triggerId));
      addToast(`Webhook trigger '${triggerName}' deleted`, 'info');
    } catch (err: any) {
      addToast(err.message || 'Failed to delete trigger', 'error');
    } finally {
      setDeletingTriggerId(null);
    }
  };

  const isStorageEnabled = planContext ? !!planContext.capabilities['storage.objects'] : false;
  const dbUsagePercent = planContext
    ? Math.min(100, Math.round((planContext.usage.dbStorageBytes / (planContext.limits.maxDbStorageBytes || 1)) * 100))
    : 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
            Project Settings & Credentials
          </h1>
          <Badge variant="outline">Multi-Tenant Scoped</Badge>
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '80px', height: '22px', borderRadius: 'var(--radius-full)' }} />
          ) : (
            <Badge variant={isStorageEnabled ? 'success' : 'info'}>
              {planContext?.planName || 'Plan'}
            </Badge>
          )}
          {!isPlanLoading && planContext?.isOverride && (
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
              {isPlanLoading ? (
                <div className="skeleton-box" style={{ width: '70px', height: '20px', borderRadius: 'var(--radius-full)' }} />
              ) : (
                <Badge variant={isStorageEnabled ? 'success' : 'outline'}>
                  {planContext?.planName || 'Plan'}
                </Badge>
              )}
              {!isPlanLoading && planContext?.isOverride && (
                <Badge variant="warning" size="sm">Tenant Override</Badge>
              )}
            </div>
            <CardDescription>
              Backend-enforced resource limits, active capabilities, and security barriers assigned to this project
            </CardDescription>
          </div>
          <div>
            {isPlanLoading ? (
              <div className="skeleton-box" style={{ width: '130px', height: '30px', borderRadius: 'var(--radius-md)' }} />
            ) : planContext?.planSlug === 'enterprise' ? (
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
          {isPlanLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  style={{
                    padding: '14px',
                    background: 'var(--bg-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div className="skeleton-box" style={{ width: '90px', height: '12px' }} />
                    <div className="skeleton-box" style={{ width: '14px', height: '14px', borderRadius: '50%' }} />
                  </div>
                  <div className="skeleton-box" style={{ width: '120px', height: '20px', marginBottom: '8px' }} />
                  <div className="skeleton-box" style={{ width: '150px', height: '10px' }} />
                </div>
              ))}
            </div>
          ) : (
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
                  {formatBytes(planContext?.usage.dbStorageBytes || 0)} / {formatBytes(planContext?.limits.maxDbStorageBytes || 0)}
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
                  {formatBytes(planContext?.limits.maxDocSizeBytes || 0)}
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
                  {(planContext?.limits.maxApiRequestsPerWindow || 0).toLocaleString()} req/win
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
                  {isStorageEnabled ? formatBytes(planContext?.limits.maxFileStorageBytes || 0) : 'Disabled (0 B)'}
                </div>
                <div style={{ fontSize: '0.72rem', color: isStorageEnabled ? 'var(--text-muted)' : '#fca5a5', marginTop: '12px' }}>
                  {isStorageEnabled ? 'S3/MinIO bucket capacity' : 'FEATURE_DISABLED on Free Tier'}
                </div>
              </div>
            </div>
          )}

          {/* Capabilities Checklist */}
          {isPlanLoading ? (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--bg-card-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
              }}
            >
              <div className="skeleton-box" style={{ width: '160px', height: '14px', marginBottom: '12px' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="skeleton-box" style={{ width: '180px', height: '18px' }} />
                ))}
              </div>
            </div>
          ) : (
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
          )}

          {/* Authoritative Security Note */}
          {isPlanLoading ? (
            <div className="skeleton-box" style={{ width: '100%', height: '40px', borderRadius: 'var(--radius-md)' }} />
          ) : (
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
              {planContext?.planSlug === 'enterprise' ? (
                <Badge variant="outline" size="sm">Utmost Plan Active</Badge>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setShowUpgradeModal(true)}>
                  Request Upgrade
                </Button>
              )}
            </div>
          )}
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
              {!publishableKey ? (
                <div
                  className="skeleton-box"
                  style={{
                    flex: 1,
                    height: '36px',
                    borderRadius: 'var(--radius-md)',
                  }}
                />
              ) : (
                <input
                  type="text"
                  readOnly
                  value={publishableKey}
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
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!publishableKey}
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
                <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {triggers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-secondary)' }}>
                    {isLoadingTriggers ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <RotateCcw size={16} className="animate-spin" /> Loading triggers from database...
                      </div>
                    ) : (
                      <div>
                        <Zap size={28} style={{ opacity: 0.35, margin: '0 auto 8px auto' }} />
                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>No webhook triggers configured</div>
                        <div style={{ fontSize: '0.8rem', marginTop: '4px', opacity: 0.7 }}>
                          Register a database webhook trigger to securely dispatch events upon document mutations.
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                triggers.map((t) => (
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
                    <td style={{ textAlign: 'center' }}>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={deletingTriggerId === t.id}
                        onClick={() => handleDeleteTrigger(t.id, t.name)}
                        icon={<Trash2 size={13} />}
                        style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                      >
                        {deletingTriggerId === t.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Developer Multi-Factor Authentication & Passkeys */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Developer Security & Multi-Factor Authentication</CardTitle>
            <CardDescription>
              Protect your developer console account with FIDO2 WebAuthn Passkeys and RFC 6238 TOTP Authenticator apps.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section 1: Authenticator App */}
          <div
            style={{
              padding: '18px 20px',
              background: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: devTotpEnrolled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: devTotpEnrolled ? 'var(--accent-emerald)' : 'var(--text-muted)',
                }}
              >
                <Smartphone size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    Authenticator App (TOTP)
                  </span>
                  <Badge variant={devTotpEnrolled ? 'success' : 'outline'} size="sm">
                    {devTotpEnrolled ? 'Active' : 'Not Enrolled'}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Use Google Authenticator, 1Password, or Microsoft Authenticator for 6-digit verification codes.
                </div>
              </div>
            </div>

            {devTotpEnrolled ? (
              <Button variant="danger" size="sm" onClick={handleDisableTotp}>
                Disable Authenticator App
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={handleStartTotpEnrollment} icon={<Plus size={14} />}>
                Set Up Authenticator App
              </Button>
            )}
          </div>

          {/* Section 2: Passkeys */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Fingerprint size={18} color="var(--accent-blue)" />
                <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  Hardware Security Keys & Passkeys
                </span>
                <Badge variant={devPasskeys.length > 0 ? 'success' : 'outline'} size="sm">
                  {devPasskeys.length} Registered
                </Badge>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowPasskeyModal(true)} icon={<Plus size={14} />}>
                Register Passkey
              </Button>
            </div>

            {devPasskeys.length === 0 ? (
              <div
                style={{
                  padding: '24px',
                  background: 'var(--bg-main)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.84rem',
                }}
              >
                No passkeys registered yet. Register Touch ID, Windows Hello, or a YubiKey for instant passwordless sign-in.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Device Name</th>
                      <th>Credential ID</th>
                      <th>Created</th>
                      <th>Last Used</th>
                      <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devPasskeys.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Key size={14} color="var(--accent-blue)" />
                            <span>{p.deviceName || 'Passkey Device'}</span>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            {p.credentialId.substring(0, 16)}...
                          </code>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {p.lastUsedAt ? new Date(p.lastUsedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeletePasskey(p.id)}
                            icon={<Trash2 size={13} color="var(--accent-rose)" />}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="var(--accent-rose)" />
            <CardTitle style={{ color: 'var(--accent-rose)' }}>Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
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
          </div>

          <div style={{ height: '1px', width: '100%', background: 'rgba(239, 68, 68, 0.2)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--accent-rose)' }}>
                Delete Project
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {isDefaultProject
                  ? 'The default platform cluster project is protected and cannot be deleted.'
                  : 'Permanently destroy this project, its collections, databases, storage objects, and credentials.'}
              </div>
            </div>
            <Button
              variant="danger"
              disabled={isDefaultProject}
              onClick={() => setShowDeleteModal(true)}
              icon={<Trash2 size={14} />}
            >
              Delete Project
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Project Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!isDeletingProject) {
            setShowDeleteModal(false);
            setDeleteConfirmationInput('');
          }
        }}
        title={`Delete Project: ${activeProject.name}`}
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--accent-rose)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              color: '#f87171',
              lineHeight: 1.5,
            }}
          >
            <strong>Warning: This action is permanent and catastrophic.</strong>
            <div style={{ marginTop: '4px' }}>
              All documents, custom databases, uploaded storage files, active API keys, and email DNS records associated with <strong>{activeProject.name}</strong> will be immediately erased. This action cannot be reversed.
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              To confirm, type <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-rose)', fontWeight: 700 }}>{activeProject.name}</span> below:
            </label>
            <Input
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              placeholder={activeProject.name}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              variant="secondary"
              disabled={isDeletingProject}
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmationInput('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={isDeletingProject || deleteConfirmationInput.trim().toLowerCase() !== activeProject.name.trim().toLowerCase()}
              onClick={handleDeleteProject}
              icon={<Trash2 size={14} />}
            >
              {isDeletingProject ? 'Erasing Project...' : 'I Understand, Delete Project'}
            </Button>
          </div>
        </div>
      </Modal>

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
                Active Plan: <span style={{ color: 'var(--accent-blue)' }}>{planContext?.planName || 'Plan'}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Authoritative quotas and capability boundaries assigned to project <code>{planContext?.projectId || projectId}</code>
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
            <Button variant="primary" onClick={handleCreateTrigger} disabled={isCreatingTrigger}>
              {isCreatingTrigger ? 'Registering...' : 'Create Trigger'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* TOTP Enrollment Modal */}
      <Modal
        isOpen={showTotpModal}
        onClose={() => {
          setShowTotpModal(false);
          setTotpEnrollmentData(null);
        }}
        title="Set Up Authenticator App (TOTP)"
        size="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {totpActivatedSuccessfully ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(34, 197, 94, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: 'var(--accent-emerald)' }}>
                <CheckCircle2 size={28} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                Authenticator App Activated!
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                Please save your 8 emergency recovery backup codes in a safe password manager. Each code can be used once if you lose your phone.
              </p>

              {totpEnrollmentData?.backupCodes && (
                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.86rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                    {totpEnrollmentData.backupCodes.map((code, idx) => (
                      <div key={idx} style={{ padding: '4px 8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                        {code}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    style={{ marginTop: '12px', width: '100%' }}
                    onClick={() => {
                      navigator.clipboard.writeText(totpEnrollmentData.backupCodes.join('\n'));
                      addToast('All backup codes copied to clipboard!', 'success');
                    }}
                    icon={<Copy size={13} />}
                  >
                    Copy All Backup Codes
                  </Button>
                </div>
              )}

              <Button
                variant="primary"
                onClick={() => {
                  setShowTotpModal(false);
                  setTotpEnrollmentData(null);
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <>
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                  1. Scan this QR code with <strong>Google Authenticator</strong>, <strong>1Password</strong>, or <strong>Microsoft Authenticator</strong>:
                </div>
                {totpEnrollmentData?.qrCodeUrl && (
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '10px',
                      background: '#ffffff',
                      borderRadius: '12px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-color)',
                      margin: '0 auto 12px',
                    }}
                  >
                    <img
                      src={totpEnrollmentData.qrCodeUrl}
                      alt="TOTP MFA QR Code"
                      style={{ width: '180px', height: '180px', display: 'block', borderRadius: '4px' }}
                    />
                  </div>
                )}
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Can't scan the QR code? Enter the setup key manually:
                </div>
              </div>

              {totpEnrollmentData && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    readOnly
                    value={totpEnrollmentData.secret}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.88rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--accent-blue)',
                      letterSpacing: '0.05em',
                      textAlign: 'center',
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(totpEnrollmentData.secret);
                      addToast('Secret copied to clipboard!', 'info');
                    }}
                    icon={<Copy size={13} />}
                  >
                    Copy
                  </Button>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  2. Enter the 6-digit confirmation code generated by your app:
                </label>
                <Input
                  id="totp-verification-input"
                  placeholder="000000"
                  maxLength={6}
                  value={totpVerificationCode}
                  onChange={(e) => setTotpVerificationCode(e.target.value)}
                  style={{ fontSize: '1.1rem', letterSpacing: '0.2em', fontFamily: 'var(--font-mono)', textAlign: 'center' }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <Button variant="secondary" onClick={() => setShowTotpModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={isActivatingTotp} onClick={handleConfirmTotpActivation}>
                  {isActivatingTotp ? 'Verifying...' : 'Verify & Activate'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Register Passkey Modal */}
      <Modal
        isOpen={showPasskeyModal}
        onClose={() => setShowPasskeyModal(false)}
        title="Register WebAuthn Passkey"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            You will be prompted by your browser or operating system to register Touch ID, Face ID, Windows Hello, or a YubiKey.
          </p>

          <Input
            label="Device Label / Description"
            placeholder="e.g. MacBook Pro Touch ID"
            value={passkeyDeviceName}
            onChange={(e) => setPasskeyDeviceName(e.target.value)}
            autoFocus
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <Button variant="secondary" onClick={() => setShowPasskeyModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={isRegisteringPasskey} onClick={handleRegisterPasskey} icon={<Fingerprint size={14} />}>
              {isRegisteringPasskey ? 'Prompting Device...' : 'Start Registration'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
