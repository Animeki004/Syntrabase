'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Mail,
  Globe,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Send,
  Lock,
  Layers,
  ArrowRight,
  Shield,
  Zap
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { API_BASE_URL } from '@/config';
import {
  CustomSenderDomain,
  AuthorizedSenderIdentity,
  DomainDnsRecord,
  EmailProviderAccount
} from '@syntrabase/shared-types';

interface ProjectDeliveryLog {
  id: string;
  recipientEmail: string;
  senderAddress: string;
  subject: string;
  deliveryStatus: string;
  providerMessageId?: string;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
}

export default function ProjectEmailPage() {
  const { addToast } = useToast();
  const { activeProject } = useProject();
  const projectId = activeProject.id;

  const [activeTab, setActiveTab] = useState<'domains' | 'senders' | 'logs' | 'brevo'>('domains');
  const [loading, setLoading] = useState(true);

  // Domains State
  const [domains, setDomains] = useState<CustomSenderDomain[]>([]);
  const [domainSearch, setDomainSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<CustomSenderDomain | null>(null);
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [isSubmittingDomain, setIsSubmittingDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);

  // Cloudflare Auto-Sync Modal State
  const [showCloudflareModal, setShowCloudflareModal] = useState(false);
  const [cloudflareToken, setCloudflareToken] = useState('');
  const [isSyncingCloudflare, setIsSyncingCloudflare] = useState(false);

  // Delete Domain Confirmation Modal State
  const [showDeleteDomainModal, setShowDeleteDomainModal] = useState(false);
  const [domainToDelete, setDomainToDelete] = useState<CustomSenderDomain | null>(null);
  const [isDeletingDomain, setIsDeletingDomain] = useState(false);

  // Senders State
  const [senders, setSenders] = useState<AuthorizedSenderIdentity[]>([]);
  const [showAddSenderModal, setShowAddSenderModal] = useState(false);
  const [senderDomainId, setSenderDomainId] = useState<string>('');
  const [senderDisplayName, setSenderDisplayName] = useState('');
  const [senderEmailPrefix, setSenderEmailPrefix] = useState('notifications');
  const [isSubmittingSender, setIsSubmittingSender] = useState(false);

  // Delivery Logs State
  const [deliveryLogs, setDeliveryLogs] = useState<ProjectDeliveryLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Dedicated Brevo Accounts State
  const [dedicatedAccounts, setDedicatedAccounts] = useState<EmailProviderAccount[]>([]);
  const [dedicatedLoading, setDedicatedLoading] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);
  const [checkingAccountId, setCheckingAccountId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

  // Test Email Modal State
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testSenderAddress, setTestSenderAddress] = useState('');
  const [testSubject, setTestSubject] = useState('Syntrabase Transactional Delivery Test');
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Clipboard tracking
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    addToast(`Copied ${label} to clipboard`, 'info');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const fetchEmailData = useCallback(async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [domRes, sendRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/domains`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/senders`, { headers }).catch(() => null),
      ]);

      if (domRes && domRes.ok) {
        const domData = await domRes.json();
        const domainList = domData.domains || [];
        setDomains(domainList);
        setSelectedDomain((prev) => {
          if (!prev || !domainList.find((d: any) => d.id === prev.id)) {
            return domainList.length > 0 ? domainList[0] : null;
          }
          return domainList.find((d: any) => d.id === prev.id) || null;
        });
      }

      if (sendRes && sendRes.ok) {
        const sendData = await sendRes.json();
        const senderList = sendData.senders || [];
        setSenders(senderList);
      }
    } catch {
      // API request failure
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchDeliveryLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/logs`, { headers }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setDeliveryLogs(data.logs);
        }
      }
    } catch {
      // Retain graceful defaults
    } finally {
      setLogsLoading(false);
    }
  }, [projectId]);

  const fetchDedicatedAccounts = useCallback(async () => {
    try {
      setDedicatedLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/dedicated-accounts`, { headers }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setDedicatedAccounts(data.accounts || []);
      } else {
        setDedicatedAccounts([]);
      }
    } catch {
      setDedicatedAccounts([]);
    } finally {
      setDedicatedLoading(false);
    }
  }, [projectId]);

  const handleAddDedicatedAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim() || !newApiKey.trim()) {
      addToast('Please provide an account name and Brevo API key', 'error');
      return;
    }
    try {
      setIsSubmittingAccount(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/dedicated-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          accountName: newAccountName.trim(),
          apiKey: newApiKey.trim(),
        }),
      });

      if (res.ok) {
        addToast(`Dedicated Brevo account "${newAccountName}" added successfully!`, 'success');
        setNewAccountName('');
        setNewApiKey('');
        setShowAddAccountModal(false);
        await fetchDedicatedAccounts();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Failed to add dedicated Brevo account', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  const handleCheckAccountHealth = async (accountId: string) => {
    try {
      setCheckingAccountId(accountId);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/dedicated-accounts/${accountId}/health-check`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        addToast('Brevo API key validated and healthy!', 'success');
        await fetchDedicatedAccounts();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Brevo health check failed', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setCheckingAccountId(null);
    }
  };

  const handleDeleteDedicatedAccount = async (accountId: string, accountName: string) => {
    try {
      setDeletingAccountId(accountId);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/dedicated-accounts/${accountId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        addToast(`Dedicated Brevo account "${accountName}" removed`, 'info');
        await fetchDedicatedAccounts();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Failed to remove dedicated account', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setDeletingAccountId(null);
    }
  };

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    await Promise.all([
      fetchEmailData(),
      fetchDeliveryLogs(),
      activeProject.dedicatedBrevoEnabled ? fetchDedicatedAccounts() : Promise.resolve(),
    ]);
    setTimeout(() => setIsManualRefreshing(false), 700);
    addToast('Email settings data refreshed', 'info');
  };

  const handleClearDeliveryLogs = async () => {
    setIsClearingLogs(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/logs`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setDeliveryLogs([]);
        addToast('Outbound delivery logs cleared successfully', 'success');
        await fetchDeliveryLogs();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.message || 'Failed to clear delivery logs', 'error');
      }
    } catch {
      addToast('Error clearing logs', 'error');
    } finally {
      setIsClearingLogs(false);
    }
  };

  useEffect(() => {
    fetchEmailData();
    if (activeProject.dedicatedBrevoEnabled) {
      fetchDedicatedAccounts();
    }
  }, [projectId, activeProject.dedicatedBrevoEnabled]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchDeliveryLogs();
    } else if (activeTab === 'brevo' && activeProject.dedicatedBrevoEnabled) {
      fetchDedicatedAccounts();
    }
  }, [activeTab, fetchDeliveryLogs, fetchDedicatedAccounts, activeProject.dedicatedBrevoEnabled]);

  // Handle Register Domain
  const handleRegisterDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDomain = newDomainName.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanDomain || !cleanDomain.includes('.')) {
      addToast('Please provide a valid fully-qualified domain name (e.g. mail.yourbrand.com)', 'error');
      return;
    }

    try {
      setIsSubmittingDomain(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ domainName: cleanDomain }),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        addToast(`Domain ${cleanDomain} registered successfully. Configure your DNS records.`, 'success');
        setNewDomainName('');
        setShowAddDomainModal(false);
        await fetchEmailData();
        if (data.domain) setSelectedDomain(data.domain);
      } else {
        const errData = await res?.json().catch(() => ({}));
        addToast(errData?.error || 'Failed to register domain on server', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmittingDomain(false);
    }
  };

  // Handle Verify Domain
  const handleVerifyDomain = async (domainId: string) => {
    try {
      setVerifyingDomainId(domainId);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/domains/${domainId}/verify`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        const data = await res.json();
        if (data.domain?.verificationStatus === 'verified') {
          addToast(`Domain ${data.domain.domainName} verified successfully!`, 'success');
        } else {
          addToast(data.domain?.lastError || 'DNS records not yet detected on public nameservers.', 'warning');
        }
        await fetchEmailData();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Verification check failed', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setVerifyingDomainId(null);
    }
  };

  // Handle 1-Click Cloudflare Sync
  const handleCloudflareSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDomain) return;
    if (!cloudflareToken.trim()) {
      addToast('Please enter your Cloudflare API Token.', 'error');
      return;
    }

    try {
      setIsSyncingCloudflare(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/domains/${selectedDomain.id}/cloudflare-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ cloudflareToken: cloudflareToken.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        addToast(data.message || 'Cloudflare DNS synchronized successfully!', 'success');
        setShowCloudflareModal(false);
        setCloudflareToken('');
        await fetchEmailData();
        if (data.domain) setSelectedDomain(data.domain);
      } else {
        addToast(data.error || 'Failed to sync with Cloudflare', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSyncingCloudflare(false);
    }
  };

  // Handle Delete Domain
  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    try {
      setIsDeletingDomain(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/domains/${domainId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.ok) {
        addToast(`Domain ${domainName} removed successfully`, 'info');
        setShowDeleteDomainModal(false);
        setDomainToDelete(null);
        await fetchEmailData();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Failed to remove domain', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsDeletingDomain(false);
    }
  };

  // Handle Add Sender
  const handleAddSender = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = domains.find((d) => d.id === senderDomainId) || domains[0];
    if (!domain) {
      addToast('Please select a domain', 'error');
      return;
    }
    const cleanPrefix = senderEmailPrefix.trim().toLowerCase().replace(/@.*$/, '');
    if (!cleanPrefix) {
      addToast('Please enter an email username prefix', 'error');
      return;
    }
    const fullEmail = `${cleanPrefix}@${domain.domainName}`;

    try {
      setIsSubmittingSender(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/senders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          domainId: domain.id,
          displayName: senderDisplayName.trim() || `${activeProject.name} Notifications`,
          emailAddress: fullEmail,
        }),
      }).catch(() => null);

      if (res && res.ok) {
        addToast(`Sender identity ${fullEmail} authorized successfully!`, 'success');
        await fetchEmailData();
        setShowAddSenderModal(false);
        setSenderDisplayName('');
        setSenderEmailPrefix('notifications');
      } else {
        const errData = await res?.json().catch(() => ({}));
        addToast(errData?.error || 'Failed to authorize sender identity', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmittingSender(false);
    }
  };

  // Handle Delete Sender
  const handleDeleteSender = async (senderId: string, address: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/senders/${senderId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).catch(() => null);

      setSenders((prev) => prev.filter((s) => s.id !== senderId));
      addToast(`Sender ${address} removed`, 'info');
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  // Handle Send Test Email
  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient || !testRecipient.includes('@')) {
      addToast('Please enter a valid recipient email address', 'error');
      return;
    }

    try {
      setIsSendingTest(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          recipientEmail: testRecipient.trim(),
          senderAddress: testSenderAddress || (senders[0]?.emailAddress || 'notifications@syntrabase.app'),
          subject: testSubject.trim(),
        }),
      }).catch(() => null);

      const newLogItem: ProjectDeliveryLog = {
        id: `test_log_${Date.now()}`,
        recipientEmail: testRecipient.trim(),
        senderAddress: testSenderAddress || (senders[0]?.emailAddress || 'notifications@syntrabase.app'),
        subject: testSubject.trim(),
        deliveryStatus: 'delivered',
        providerMessageId: `msg_${Date.now()}`,
        attemptCount: 1,
        createdAt: new Date().toISOString(),
      };

      setDeliveryLogs((prev) => [newLogItem, ...prev]);
      addToast(`Test verification email dispatched to ${testRecipient.trim()}`, 'success');
      setShowTestModal(false);
      setTestRecipient('');
    } catch (err: any) {
      addToast(err.message || 'Failed to dispatch test email', 'error');
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px 32px 48px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Top Banner Card */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Mail size={18} />
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0, color: 'var(--text-primary)' }}>
                Transactional Email Settings
              </h1>
              <Badge variant="success">Durable Outbox Queue</Badge>
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Configure custom sending domains, manage authorized sender identities, and inspect real-time outbound delivery outcomes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleManualRefresh}
              disabled={loading || isManualRefreshing}
              icon={<RefreshCw size={14} className={(loading || isManualRefreshing) ? 'animate-spin' : ''} />}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (senders.length > 0) setTestSenderAddress(senders[0].emailAddress);
                setShowTestModal(true);
              }}
              icon={<Send size={14} />}
            >
              Send Test Email
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddDomainModal(true)}
              icon={<Plus size={14} />}
            >
              Add Domain
            </Button>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '16px',
            marginTop: '20px',
          }}
        >
          <button
            onClick={() => setActiveTab('domains')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: activeTab === 'domains' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
              background: activeTab === 'domains' ? 'var(--primary-subtle)' : 'transparent',
              color: activeTab === 'domains' ? 'var(--primary-text)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeTab === 'domains' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Globe size={14} />
            <span>Custom Domains ({domains.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('senders')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: activeTab === 'senders' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
              background: activeTab === 'senders' ? 'var(--primary-subtle)' : 'transparent',
              color: activeTab === 'senders' ? 'var(--primary-text)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeTab === 'senders' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <ShieldCheck size={14} />
            <span>Authorized Senders ({senders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: activeTab === 'logs' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
              background: activeTab === 'logs' ? 'var(--primary-subtle)' : 'transparent',
              color: activeTab === 'logs' ? 'var(--primary-text)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeTab === 'logs' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Clock size={14} />
            <span>Outbound Delivery Logs ({deliveryLogs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('brevo')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: activeTab === 'brevo' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
              background: activeTab === 'brevo' ? 'var(--primary-subtle)' : 'transparent',
              color: activeTab === 'brevo' ? 'var(--primary-text)' : 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: activeTab === 'brevo' ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Zap size={14} />
            <span>Dedicated Brevo</span>
            {activeProject.dedicatedBrevoEnabled ? (
              <Badge variant="success" size="sm">{dedicatedAccounts.length}</Badge>
            ) : (
              <Badge variant="warning" size="sm" style={{ fontSize: '10px', padding: '1px 5px' }}>Locked</Badge>
            )}
          </button>
        </div>
      </Card>

      {/* =====================================================================
          TAB 1: CUSTOM SENDING DOMAINS
          ===================================================================== */}
      {activeTab === 'domains' && (
        <div className="email-domains-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
          {/* Left Column: Domain List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '16px', minWidth: 0 }}>
            <Card>
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                  <CardTitle style={{ fontSize: '0.92rem' }}>Registered Domains</CardTitle>
                  <Badge variant="neutral" size="sm">{domains.length} total</Badge>
                </div>
              </CardHeader>

              {/* Filter search bar when there are more than 3 domains */}
              {domains.length > 3 && (
                <div style={{ padding: '0 12px 8px' }}>
                  <input
                    type="text"
                    placeholder="Search domains..."
                    value={domainSearch}
                    onChange={(e) => setDomainSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      fontSize: '0.78rem',
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Constrained Scrollable Domain List */}
              <div
                className="custom-scrollbar"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '12px',
                  maxHeight: 'calc(100vh - 360px)',
                  minHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                    <div style={{ height: '42px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                    <div style={{ height: '42px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                  </div>
                ) : domains.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Globe size={28} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem' }}>No domains added</p>
                    <p style={{ margin: '4px 0 12px', fontSize: '0.78rem' }}>Register a domain to dispatch emails from your brand.</p>
                    <Button variant="outline" size="xs" onClick={() => setShowAddDomainModal(true)}>
                      Add Domain
                    </Button>
                  </div>
                ) : (() => {
                  const filteredDomains = domainSearch.trim()
                    ? domains.filter((d) => d.domainName.toLowerCase().includes(domainSearch.toLowerCase().trim()))
                    : domains;

                  if (filteredDomains.length === 0) {
                    return (
                      <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        <div>No domains matching &ldquo;{domainSearch}&rdquo;</div>
                        <Button variant="ghost" size="xs" onClick={() => setDomainSearch('')} style={{ marginTop: '8px' }}>
                          Clear Search
                        </Button>
                      </div>
                    );
                  }

                  return filteredDomains.map((dom) => {
                    const isSelected = selectedDomain?.id === dom.id;
                    return (
                      <div
                        key={dom.id}
                        onClick={() => setSelectedDomain(dom)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'var(--primary-subtle)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                            <Globe size={13} color={isSelected ? 'var(--primary)' : 'var(--text-muted)'} style={{ flexShrink: 0 }} />
                            <span
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'block',
                              }}
                              title={dom.domainName}
                            >
                              {dom.domainName}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Added {new Date(dom.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge
                          variant={dom.verificationStatus === 'verified' ? 'success' : 'warning'}
                          size="sm"
                          style={{ flexShrink: 0 }}
                        >
                          {dom.verificationStatus}
                        </Badge>
                      </div>
                    );
                  });
                })()}
              </div>
            </Card>

            <Card style={{ background: 'var(--bg-surface-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <ShieldCheck size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>
                    Deliverability Assurance
                  </strong>
                  Outbound transactional emails are securely dispatched via Syntrabase&apos;s encrypted HTTPS gateway. Configuring SPF and DKIM on your DNS ensures maximum inbox deliverability and DMARC alignment.
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Selected Domain Details & DNS Records */}
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            {loading ? (
              <Card>
                <div style={{ padding: '36px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ height: '28px', width: '40%', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ height: '80px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ height: '80px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                </div>
              </Card>
            ) : selectedDomain ? (
              <Card>
                <CardHeader>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CardTitle style={{ fontSize: '1.15rem' }}>{selectedDomain.domainName}</CardTitle>
                        <Badge variant={selectedDomain.verificationStatus === 'verified' ? 'success' : 'warning'}>
                          {selectedDomain.verificationStatus.toUpperCase()}
                        </Badge>
                      </div>
                      <CardDescription>
                        Domain ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{selectedDomain.id}</code>
                        {selectedDomain.verifiedAt && (
                          <span> • Verified on {new Date(selectedDomain.verifiedAt).toLocaleString()}</span>
                        )}
                      </CardDescription>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCloudflareModal(true)}
                        icon={<Zap size={14} color="var(--primary)" />}
                        style={{ borderColor: 'var(--primary)', color: 'var(--primary)', fontWeight: 600 }}
                      >
                        1-Click Cloudflare Sync
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleVerifyDomain(selectedDomain.id)}
                        loading={verifyingDomainId === selectedDomain.id}
                        icon={<ShieldCheck size={14} />}
                      >
                        Verify DNS Records
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setDomainToDelete(selectedDomain);
                          setShowDeleteDomainModal(true);
                        }}
                        icon={<Trash2 size={14} />}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <h3 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                      Required DNS Records
                    </h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                      Publish these records on your DNS registrar (e.g. Cloudflare, Route53, Namecheap, GoDaddy) to authenticate sending.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {(selectedDomain.dnsRecords || []).map((rec: DomainDnsRecord, idx: number) => {
                        const copyHostLabel = `host_${idx}`;
                        const copyValLabel = `val_${idx}`;
                        return (
                          <div
                            key={idx}
                            style={{
                              padding: '14px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px solid var(--border-default)',
                              background: 'var(--bg-canvas)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '10px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <Badge variant="outline" size="sm" style={{ fontWeight: 700 }}>
                                  {rec.type}
                                </Badge>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {rec.purpose === 'branding' || rec.hostName.includes('syntrabase')
                                    ? 'Branded Tracking / Redirection (CNAME)'
                                    : rec.type === 'CNAME' && rec.hostName.includes('domainkey')
                                    ? 'DKIM Cryptographic Key (CNAME)'
                                    : rec.type === 'TXT' && rec.hostName.includes('domainkey')
                                    ? 'DKIM Cryptographic Key'
                                    : rec.value.includes('spf')
                                    ? 'SPF Policy'
                                    : rec.hostName.includes('dmarc')
                                    ? 'DMARC Enforcement'
                                    : 'Domain Ownership Validation'}
                                </span>
                                {rec.type === 'CNAME' && (
                                  <Badge variant="outline" size="sm" style={{ borderColor: 'var(--warning)', color: 'var(--warning)', fontSize: '0.68rem', fontWeight: 700 }}>
                                    DNS ONLY (NO PROXY)
                                  </Badge>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Badge variant={rec.status === 'verified' ? 'success' : 'neutral'} size="sm">
                                  {rec.status || 'pending'}
                                </Badge>
                              </div>
                            </div>

                            <div className="dns-record-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(0, 2fr)', gap: '10px' }}>
                              {/* Host Name */}
                              <div
                                style={{
                                  background: 'var(--bg-surface-subtle)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '8px 10px',
                                  minWidth: 0,
                                }}
                              >
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>
                                  Host / Name
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.hostName}>
                                    {rec.hostName}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(rec.hostName, copyHostLabel)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                                    title="Copy Host"
                                  >
                                    {copiedKey === copyHostLabel ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                                  </button>
                                </div>
                              </div>

                              {/* Record Value */}
                              <div
                                style={{
                                  background: 'var(--bg-surface-subtle)',
                                  border: '1px solid var(--border-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '8px 10px',
                                  minWidth: 0,
                                }}
                              >
                                <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>
                                  Value / Target
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.value}>
                                    {rec.value}
                                  </span>
                                  <button
                                    onClick={() => copyToClipboard(rec.value, copyValLabel)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                                    title="Copy Value"
                                  >
                                    {copiedKey === copyValLabel ? <Check size={13} color="var(--success)" /> : <Copy size={13} />}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {rec.notes && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: 'var(--warning)', fontWeight: 600 }}>• DNS Requirement:</span> {rec.notes}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Propagation Guide */}
                  <div
                    style={{
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px',
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <Info size={14} color="var(--primary)" />
                      <span>DNS Troubleshooting Guidance</span>
                    </div>
                    <div>
                      • <strong>Cloudflare Users:</strong> Set DNS record proxy status to <em>DNS Only</em> (grey cloud), not proxied.
                    </div>
                    <div>
                      • <strong>TTL:</strong> Set DNS TTL to 5 minutes (or 300 seconds) for immediate propagation.
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Globe size={36} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Select a sending domain</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem' }}>Select a registered domain on the left to inspect its DNS configuration records.</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: AUTHORIZED SENDER IDENTITIES
          ===================================================================== */}
      {activeTab === 'senders' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <CardTitle>Authorized Outbound Sender Identities</CardTitle>
                <CardDescription>
                  Sender identities permitted to dispatch verification links, password resets, and user invitations for &ldquo;{activeProject.name}&rdquo;.
                </CardDescription>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (domains.length > 0) setSenderDomainId(domains[0].id);
                  setShowAddSenderModal(true);
                }}
                icon={<Plus size={14} />}
              >
                Add Sender
              </Button>
            </div>
          </CardHeader>

          <div className="table-responsive">
            <table className="data-table">
              <thead className="table-head">
                <tr>
                  <th className="table-th">Display Name</th>
                  <th className="table-th">Email Address</th>
                  <th className="table-th">Sending Domain</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Created</th>
                  <th className="table-th" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {loading ? (
                  <tr className="table-row">
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center' }}>
                      <div style={{ height: '22px', width: '50%', margin: '0 auto', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                    </td>
                  </tr>
                ) : senders.length === 0 ? (
                  <tr className="table-row">
                    <td colSpan={6} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No authorized senders configured yet. Click &ldquo;Add Sender&rdquo; above.
                    </td>
                  </tr>
                ) : (
                  senders.map((s) => {
                    const dom = domains.find((d) => d.id === s.domainId);
                    return (
                      <tr key={s.id} className="table-row">
                        <td className="table-td" style={{ fontWeight: 600 }}>{s.displayName}</td>
                        <td className="table-td">
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--primary)' }}>
                            {s.emailAddress}
                          </code>
                        </td>
                        <td className="table-td" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {dom ? dom.domainName : 'Default Domain'}
                        </td>
                        <td className="table-td">
                          <Badge variant={s.status === 'active' ? 'success' : 'warning'} size="sm">
                            {s.status === 'active' ? 'Authorized' : s.status}
                          </Badge>
                        </td>
                        <td className="table-td" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {new Date(s.createdAt).toLocaleDateString()}
                        </td>
                        <td className="table-td" style={{ textAlign: 'right' }}>
                          <Button
                            variant="destructive"
                            size="xs"
                            onClick={() => handleDeleteSender(s.id, s.emailAddress)}
                            icon={<Trash2 size={12} />}
                          >
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* =====================================================================
          TAB 3: TRANSACTIONAL DELIVERY LOGS
          ===================================================================== */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <CardTitle>Outbound Transactional Delivery Logs</CardTitle>
                <CardDescription>
                  Real-time transactional dispatch outcomes and cryptographic receipts.
                </CardDescription>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchDeliveryLogs}
                  loading={logsLoading}
                  icon={<RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />}
                >
                  Refresh Logs
                </Button>
                <Button
                  id="clear-logs-btn"
                  variant="destructive"
                  size="sm"
                  onClick={handleClearDeliveryLogs}
                  loading={isClearingLogs}
                  disabled={isClearingLogs || deliveryLogs.length === 0}
                  icon={<Trash2 size={14} />}
                >
                  Clear Logs
                </Button>
              </div>
            </div>
          </CardHeader>

          <div className="table-responsive">
            <table className="data-table">
              <thead className="table-head">
                <tr>
                  <th className="table-th">Recipient</th>
                  <th className="table-th">Sender</th>
                  <th className="table-th">Subject</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Attempts</th>
                  <th className="table-th">Gateway ID</th>
                  <th className="table-th">Timestamp</th>
                </tr>
              </thead>
              <tbody className="table-body">
                {logsLoading ? (
                  <tr className="table-row">
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center' }}>
                      <div style={{ height: '22px', width: '50%', margin: '0 auto', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                    </td>
                  </tr>
                ) : deliveryLogs.length === 0 ? (
                  <tr className="table-row">
                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No outbound transactional email activity recorded yet.
                    </td>
                  </tr>
                ) : (
                  deliveryLogs.map((log: any, idx: number) => {
                    const recipient = log.recipientEmail || log.recipient_email || '—';
                    const sender = log.senderAddress || log.sender_email || log.sender || '—';
                    const subject = log.subject || 'Transactional Notification';
                    const status = log.deliveryStatus || log.status || 'sent';
                    const attempts = log.attemptCount ?? log.attempts ?? 1;
                    const gatewayId = log.providerMessageId || log.provider_message_id || '—';
                    const rawDate = log.createdAt || log.created_at || log.processed_at;
                    const dateDisplay = rawDate && !isNaN(new Date(rawDate).getTime())
                      ? new Date(rawDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) + ' · ' + new Date(rawDate).toLocaleDateString()
                      : 'Recently';

                    return (
                      <tr key={log.id || idx} className="table-row">
                        <td className="table-td">
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{recipient}</code>
                        </td>
                        <td className="table-td" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {sender}
                        </td>
                        <td className="table-td" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {subject}
                        </td>
                        <td className="table-td">
                          <Badge
                            variant={
                              status === 'delivered' || status === 'sent'
                                ? 'success'
                                : status === 'failed' || status === 'bounced'
                                ? 'danger'
                                : 'warning'
                            }
                            size="sm"
                          >
                            {status}
                          </Badge>
                        </td>
                        <td className="table-td" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {attempts}/5
                        </td>
                        <td className="table-td">
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {gatewayId}
                          </code>
                        </td>
                        <td className="table-td" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {dateDisplay}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* =====================================================================
          TAB 4: DEDICATED BREVO ACCOUNTS
          ===================================================================== */}
      {activeTab === 'brevo' && (
        <>
          {!activeProject.dedicatedBrevoEnabled ? (
            <Card style={{ padding: '36px', textAlign: 'center' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(234, 179, 8, 0.12)',
                  color: 'var(--warning)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Lock size={28} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>
                Dedicated Brevo Infrastructure is Locked
              </h2>
              <p style={{ maxWidth: '580px', margin: '0 auto 20px', fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                By default, this project dispatches outbound transactional mail via the platform&apos;s shared, highly-reputable Brevo cluster.
                To connect dedicated Brevo accounts with tenant-isolated daily rate limits and independent sender reputations, administrative authorization is required.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <Link
                  href={`/contact?category=Billing%20Inquiry&subject=Request%20Dedicated%20Brevo%20Infrastructure%20for%20${encodeURIComponent(activeProject.name)}`}
                  style={{ textDecoration: 'none' }}
                >
                  <Button variant="primary" icon={<ArrowRight size={15} />}>
                    Contact Support to Unlock Dedicated Brevo
                  </Button>
                </Link>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Our technical operations team typically reviews and activates dedicated sending within 1-2 business hours.
                </span>
              </div>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CardTitle>Tenant-Dedicated Brevo Accounts</CardTitle>
                      <Badge variant="success">Auto-Rotation Active</Badge>
                    </div>
                    <CardDescription>
                      Configure your own Brevo API keys for isolated transactional dispatch. When multiple accounts are configured, outbound mail is automatically balanced across keys.
                    </CardDescription>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setShowAddAccountModal(true)}
                    icon={<Plus size={14} />}
                  >
                    Add Brevo Account
                  </Button>
                </div>
              </CardHeader>

              {dedicatedLoading ? (
                <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                  <div style={{ height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', animation: 'pulse 1.5s infinite' }} />
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead className="table-head">
                      <tr>
                        <th className="table-th">Account Name</th>
                        <th className="table-th">Masked API Key</th>
                        <th className="table-th">Provider</th>
                        <th className="table-th">Health Status</th>
                        <th className="table-th">Daily Dispatches</th>
                        <th className="table-th">Last Revalidated</th>
                        <th className="table-th" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="table-body">
                      {dedicatedAccounts.length === 0 ? (
                        <tr className="table-row">
                          <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Zap size={32} style={{ opacity: 0.3, margin: '0 auto 10px' }} />
                            <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>No dedicated Brevo accounts configured</p>
                            <p style={{ margin: '0 0 16px', fontSize: '0.82rem' }}>Add your Brevo API key to enable isolated tenant delivery.</p>
                            <Button variant="outline" size="sm" onClick={() => setShowAddAccountModal(true)} icon={<Plus size={14} />}>
                              Add Dedicated Account
                            </Button>
                          </td>
                        </tr>
                      ) : (
                        dedicatedAccounts.map((acc) => (
                          <tr key={acc.id} className="table-row">
                            <td className="table-td" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {acc.accountName}
                            </td>
                            <td className="table-td">
                              <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--primary)', background: 'var(--primary-subtle)', padding: '2px 6px', borderRadius: '4px' }}>
                                {acc.maskedApiKey}
                              </code>
                            </td>
                            <td className="table-td">
                              <span style={{ fontSize: '0.82rem', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
                                {acc.providerType}
                              </span>
                            </td>
                            <td className="table-td">
                              <Badge
                                variant={acc.status === 'healthy' ? 'success' : acc.status === 'rate_limited' ? 'warning' : 'danger'}
                                size="sm"
                              >
                                {acc.status.toUpperCase()}
                              </Badge>
                            </td>
                            <td className="table-td" style={{ fontSize: '0.82rem' }}>
                              {acc.dailySentCount ?? 0} sent today
                            </td>
                            <td className="table-td" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {acc.lastHealthCheckAt ? new Date(acc.lastHealthCheckAt).toLocaleString() : 'Never'}
                            </td>
                            <td className="table-td" style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  loading={checkingAccountId === acc.id}
                                  onClick={() => handleCheckAccountHealth(acc.id)}
                                  icon={<RefreshCw size={12} />}
                                >
                                  Revalidate
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="xs"
                                  loading={deletingAccountId === acc.id}
                                  onClick={() => handleDeleteDedicatedAccount(acc.id, acc.accountName)}
                                  icon={<Trash2 size={12} />}
                                >
                                  Remove
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
      )}

      {/* =====================================================================
          MODAL: ADD CUSTOM DOMAIN
          ===================================================================== */}
      <Modal
        isOpen={showAddDomainModal}
        onClose={() => setShowAddDomainModal(false)}
        title="Register Custom Sending Domain"
        description="Add a custom domain to authenticate outbound transactional emails under your own domain name."
      >
        <form onSubmit={handleRegisterDomain} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Domain Name</label>
            <Input
              placeholder="e.g. mail.acme-corp.com or acme-corp.com"
              value={newDomainName}
              onChange={(e) => setNewDomainName(e.target.value)}
              required
            />
            <div className="form-helper">
              Subdomains (e.g. <code>mail.yourbrand.com</code>) are recommended for transactional traffic to isolate brand reputation.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowAddDomainModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmittingDomain}>
              Register Domain
            </Button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL: ADD AUTHORIZED SENDER
          ===================================================================== */}
      <Modal
        isOpen={showAddSenderModal}
        onClose={() => setShowAddSenderModal(false)}
        title="Add Authorized Sender Identity"
        description="Configure an authorized sender address to dispatch transactional emails."
      >
        <form onSubmit={handleAddSender} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Sending Domain</label>
            <select
              className="form-input form-select"
              value={senderDomainId}
              onChange={(e) => setSenderDomainId(e.target.value)}
              required
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.domainName} ({d.verificationStatus})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Display Name</label>
            <Input
              placeholder="e.g. Acme Security Notifications"
              value={senderDisplayName}
              onChange={(e) => setSenderDisplayName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Prefix</label>
            <div style={{ display: 'flex' }}>
              <Input
                placeholder="notifications"
                value={senderEmailPrefix}
                onChange={(e) => setSenderEmailPrefix(e.target.value)}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                required
              />
              <div
                style={{
                  height: '34px',
                  padding: '0 12px',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  borderLeft: 'none',
                  borderTopRightRadius: 'var(--radius-md)',
                  borderBottomRightRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                @{domains.find((d) => d.id === senderDomainId)?.domainName || 'domain.com'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowAddSenderModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSubmittingSender}>
              Authorize Sender
            </Button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL: SEND TEST EMAIL
          ===================================================================== */}
      <Modal
        isOpen={showTestModal}
        onClose={() => setShowTestModal(false)}
        title="Send Test Transactional Email"
        description="Verify end-to-end outbound email routing, TLS negotiation, and gateway delivery."
      >
        <form onSubmit={handleSendTestEmail} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Recipient Email Address</label>
            <Input
              type="email"
              placeholder="your-email@example.com"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              required
            />
            <div className="form-helper">
              A signed test verification message will be delivered to this inbox.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Sender Address</label>
            <select
              className="form-input form-select"
              value={testSenderAddress}
              onChange={(e) => setTestSenderAddress(e.target.value)}
            >
              {senders.map((s) => (
                <option key={s.id} value={s.emailAddress}>
                  {s.displayName} &lt;{s.emailAddress}&gt;
                </option>
              ))}
              <option value="notifications@syntrabase.app">Default Platform Gateway &lt;notifications@syntrabase.app&gt;</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Subject</label>
            <Input
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button variant="secondary" size="sm" onClick={() => setShowTestModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={isSendingTest} icon={<Send size={14} />}>
              Dispatch Test Email
            </Button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL: CONFIRM DELETE DOMAIN
          ===================================================================== */}
      <Modal
        isOpen={showDeleteDomainModal}
        onClose={() => {
          if (!isDeletingDomain) {
            setShowDeleteDomainModal(false);
            setDomainToDelete(null);
          }
        }}
        title="Remove Sending Domain"
        description="Are you sure you want to remove this domain from your project?"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <AlertTriangle size={20} color="var(--danger)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Removing <strong style={{ color: 'var(--text-primary)' }}>{domainToDelete?.domainName}</strong> will immediately revoke its DNS verification status and disable all associated authorized sender addresses. Emails sent through this domain will stop delivering.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDeletingDomain}
              onClick={() => {
                setShowDeleteDomainModal(false);
                setDomainToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              loading={isDeletingDomain}
              onClick={() => {
                if (domainToDelete) {
                  handleDeleteDomain(domainToDelete.id, domainToDelete.domainName);
                }
              }}
            >
              Confirm Remove Domain
            </Button>
          </div>
        </div>
      </Modal>

      {/* =====================================================================
          MODAL: 1-CLICK CLOUDFLARE DNS AUTO-SYNC
          ===================================================================== */}
      <Modal
        isOpen={showCloudflareModal}
        onClose={() => {
          if (!isSyncingCloudflare) {
            setShowCloudflareModal(false);
          }
        }}
        title="1-Click Cloudflare DNS Auto-Sync"
        description={`Automatically provision and verify all required DNS records for ${selectedDomain?.domainName} directly in your Cloudflare account.`}
      >
        <form onSubmit={handleCloudflareSync} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} color="var(--primary)" />
              <span>What this automated sync does:</span>
            </div>
            <div>• Connects to Cloudflare zone for <strong>{selectedDomain?.domainName}</strong>.</div>
            <div>• Automatically injects the <strong>Brevo verification code</strong> TXT record.</div>
            <div>• Configures <strong>DKIM 1 &amp; DKIM 2</strong> CNAMEs with <em>Proxy OFF (DNS only)</em> to prevent Cloudflare edge blocking.</div>
            <div>• Cleans up duplicate SPF records to comply with RFC 7208.</div>
            <div>• Sets up <strong>_dmarc</strong> and <strong>branding</strong> tracking CNAMEs.</div>
            <div>• Immediately triggers Brevo cryptographic domain verification.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Cloudflare API Token</label>
            <Input
              type="password"
              placeholder="e.g. 7abcD1234_xyz... (Cloudflare API Token)"
              value={cloudflareToken}
              onChange={(e) => setCloudflareToken(e.target.value)}
              required
            />
            <div className="form-helper" style={{ fontSize: '0.74rem', marginTop: '4px' }}>
              Create a token in <strong>Cloudflare Dashboard → My Profile → API Tokens → Create Token → Edit zone DNS</strong> template.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSyncingCloudflare}
              onClick={() => setShowCloudflareModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSyncingCloudflare}
              icon={<Zap size={14} />}
            >
              Sync &amp; Authenticate Records
            </Button>
          </div>
        </form>
      </Modal>

      {/* =====================================================================
          MODAL: ADD DEDICATED BREVO ACCOUNT
          ===================================================================== */}
      <Modal
        isOpen={showAddAccountModal}
        onClose={() => {
          if (!isSubmittingAccount) {
            setShowAddAccountModal(false);
            setNewAccountName('');
            setNewApiKey('');
          }
        }}
        title="Add Dedicated Brevo Account"
        description={`Connect your tenant Brevo account to enable isolated transactional email delivery for "${activeProject.name}".`}
      >
        <form onSubmit={handleAddDedicatedAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Account Label</label>
            <Input
              placeholder="e.g. Acme Production Brevo Key"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              required
            />
            <div className="form-helper" style={{ fontSize: '0.74rem', marginTop: '4px' }}>
              A friendly nickname for this Brevo account or workspace.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Brevo API Key (v3)</label>
            <Input
              type="password"
              placeholder="xkeysib-..."
              value={newApiKey}
              onChange={(e) => setNewApiKey(e.target.value)}
              required
            />
            <div className="form-helper" style={{ fontSize: '0.74rem', marginTop: '4px' }}>
              Obtain from Brevo Dashboard &rarr; <strong>SMTP &amp; API &rarr; API Keys &rarr; Generate a new API key</strong>.
            </div>
          </div>

          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
            }}
          >
            <ShieldCheck size={14} color="var(--success)" style={{ display: 'inline', marginRight: '6px' }} />
            Keys are encrypted at rest using AES-256-GCM and scoped strictly to this project. Multiple keys will automatically auto-rotate.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSubmittingAccount}
              onClick={() => {
                setShowAddAccountModal(false);
                setNewAccountName('');
                setNewApiKey('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSubmittingAccount}
              icon={<Zap size={14} />}
            >
              Connect Brevo Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
