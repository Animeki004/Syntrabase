'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Server,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  Send,
  Trash2,
  Power,
  KeyRound,
  Layers,
  Clock,
  Eye,
  Sliders,
  AlertCircle,
  Globe,
  Check,
  ExternalLink,
  ShieldCheck,
  Zap,
  Star,
  ChevronDown,
  ChevronUp,
  Search
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import {
  EmailProviderAccount,
  EmailPlatformPolicy,
  EmailOutboxItem,
} from '@syntrabase/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function GlobalEmailControlPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'accounts' | 'queue' | 'policy' | 'domains' | 'senders'>('accounts');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['accounts', 'queue', 'policy', 'domains', 'senders'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  // Provider Accounts State
  const [accounts, setAccounts] = useState<EmailProviderAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_selected_email_account') || '';
    }
    return '';
  });

  // Add Account Modal State
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newProviderType, setNewProviderType] = useState<'brevo' | 'smtp'>('brevo');
  const [newAccountName, setNewAccountName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newSmtpHost, setNewSmtpHost] = useState('smtp.gmail.com');
  const [newSmtpPort, setNewSmtpPort] = useState(465);
  const [newSmtpSecure, setNewSmtpSecure] = useState(true);
  const [newSmtpUser, setNewSmtpUser] = useState('');
  const [newSmtpPass, setNewSmtpPass] = useState('');
  const [newSmtpDailyLimit, setNewSmtpDailyLimit] = useState(500);
  const [isSubmittingAccount, setIsSubmittingAccount] = useState(false);

  // Edit Account Modal State
  const [editAccount, setEditAccount] = useState<EmailProviderAccount | null>(null);
  const [editProviderType, setEditProviderType] = useState<'brevo' | 'smtp'>('brevo');
  const [editAccountName, setEditAccountName] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editSmtpHost, setEditSmtpHost] = useState('smtp.gmail.com');
  const [editSmtpPort, setEditSmtpPort] = useState(465);
  const [editSmtpSecure, setEditSmtpSecure] = useState(true);
  const [editSmtpUser, setEditSmtpUser] = useState('');
  const [editSmtpPass, setEditSmtpPass] = useState('');
  const [editSmtpDailyLimit, setEditSmtpDailyLimit] = useState(500);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Test Email Dispatch Modal State
  const [testSendAccount, setTestSendAccount] = useState<EmailProviderAccount | null>(null);
  const [testRecipient, setTestRecipient] = useState('');
  const [testSubject, setTestSubject] = useState('Syntrabase Live Delivery Test');
  const [testMessage, setTestMessage] = useState('Hello! This is a live email dispatch to verify deliverability and confirm remaining quota decrement.');
  const [isSendingLiveTest, setIsSendingLiveTest] = useState(false);

  // Policy & Global Controls State
  const [policy, setPolicy] = useState<EmailPlatformPolicy>({
    id: 1,
    globalSendingEnabled: true,
    emergencyShutdown: false,
    dailyProjectCap: 500,
    monthlyProjectCap: 15000,
    burstRateLimitPerMinute: 60,
    enforcementAction: 'reject',
    allowedDomainsPerProject: 5,
    requireEmailVerification: true,
    maxRetryAttempts: 5,
    defaultProviderType: 'brevo',
    updatedAt: new Date().toISOString(),
  });
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  // Outbox Queue State
  const [queueMetrics, setQueueMetrics] = useState({
    queued: 0,
    processing: 0,
    sent: 0,
    delivered: 0,
    deferred: 0,
    failed: 0,
    queueDepth: 0,
  });
  const [outboxItems, setOutboxItems] = useState<EmailOutboxItem[]>([]);
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [isPruningQueue, setIsPruningQueue] = useState(false);
  const [showEmergencyShutdownModal, setShowEmergencyShutdownModal] = useState(false);
  const [isSyncingBrevo, setIsSyncingBrevo] = useState(false);
  const [checkingMessageId, setCheckingMessageId] = useState<string | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);

  // Custom Sender Domains State
  const [domains, setDomains] = useState<any[]>([]);
  const [isLoadingDomains, setIsLoadingDomains] = useState(false);
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);
  const [newDomainName, setNewDomainName] = useState('');
  const [newDomainAccount, setNewDomainAccount] = useState('');
  const [isSubmittingDomain, setIsSubmittingDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);

  // Cloudflare & Bulk Delete States
  const [showCloudflareModal, setShowCloudflareModal] = useState(false);
  const [cloudflareToken, setCloudflareToken] = useState('');
  const [isSyncingCloudflare, setIsSyncingCloudflare] = useState(false);
  const [selectedDomainForCloudflare, setSelectedDomainForCloudflare] = useState<any>(null);
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [domainSearchFilter, setDomainSearchFilter] = useState('');
  const [expandedDomainIds, setExpandedDomainIds] = useState<string[]>([]);

  const toggleDomainExpanded = (id: string) => {
    setExpandedDomainIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const handleToggleAllDomains = () => {
    if (expandedDomainIds.length === domains.length) {
      setExpandedDomainIds([]);
    } else {
      setExpandedDomainIds(domains.map((d) => d.id));
    }
  };

  // Authorized Sender Identities State
  const [senders, setSenders] = useState<any[]>([]);
  const [isLoadingSenders, setIsLoadingSenders] = useState(false);
  const [showAddSenderModal, setShowAddSenderModal] = useState(false);
  const [senderDomainId, setSenderDomainId] = useState('');
  const [senderDisplayName, setSenderDisplayName] = useState('');
  const [senderEmailPrefix, setSenderEmailPrefix] = useState('');
  const [senderScope, setSenderScope] = useState<'platform' | 'project'>('platform');
  const [isSubmittingSender, setIsSubmittingSender] = useState(false);

  const getAdminToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || '';
    }
    return '';
  };

  // Fetch Accounts
  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch {
      // In-memory fallback
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  // Fetch Policy
  const fetchPolicy = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/policy`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.policy) setPolicy(data.policy);
      }
    } catch {
      // Fallback
    }
  }, []);

  // Fetch Queue Metrics
  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/queue`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) setQueueMetrics(data.metrics);
        if (data.items) setOutboxItems(data.items);
      }
    } catch {
      // Fallback
    }
  }, []);

  // Fetch Custom Sender Domains
  const fetchDomains = useCallback(async () => {
    setIsLoadingDomains(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/domains`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDomains(data.domains || []);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingDomains(false);
    }
  }, []);

  // Fetch Authorized Senders
  const fetchSenders = useCallback(async () => {
    setIsLoadingSenders(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/senders`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSenders(data.senders || []);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingSenders(false);
    }
  }, []);

  const handleRegisterDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainName) return;
    setIsSubmittingDomain(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/domains`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          domainName: newDomainName.trim(),
          providerAccountId: newDomainAccount || undefined,
          projectId: 'platform',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Failed to register custom domain', 'error');
        return;
      }
      addToast(`Domain ${data.domain.domainName} registered. Configure the DNS records below.`, 'success');
      setShowAddDomainModal(false);
      setNewDomainName('');
      await fetchDomains();
    } catch (err: any) {
      addToast(err.message || 'Network error registering domain', 'error');
    } finally {
      setIsSubmittingDomain(false);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    setVerifyingDomainId(domainId);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/domains/${domainId}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Domain verification check failed', 'error');
        return;
      }
      if (data.domain.verificationStatus === 'verified') {
        addToast(`Domain verified! DKIM, SPF, and MX records authenticated.`, 'success');
      } else {
        addToast(`DNS check complete: Status is ${data.domain.verificationStatus}. Some DNS records may still be propagating.`, 'info');
      }
      await fetchDomains();
    } catch (err: any) {
      addToast(err.message || 'Network error verifying domain', 'error');
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const handleDeleteDomain = async (domainId: string) => {
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/email/domains/${domainId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        addToast('Sender domain deleted successfully', 'info');
        setSelectedDomainIds((prev) => prev.filter((id) => id !== domainId));
        await fetchDomains();
      } else {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || 'Failed to delete domain', 'error');
      }
    } catch {
      addToast('Failed to delete domain', 'error');
    }
  };

  const handleBulkDeleteDomains = async () => {
    if (selectedDomainIds.length === 0) return;
    const count = selectedDomainIds.length;
    setIsBulkDeleting(true);
    const toDeleteIds = [...selectedDomainIds];
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/email/domains/bulk-delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: toDeleteIds }),
      });
      if (res.ok) {
        addToast(`Successfully deleted ${count} custom domains`, 'success');
        setSelectedDomainIds([]);
        setDomains((prev) => prev.filter((d) => !toDeleteIds.includes(d.id)));
        await fetchDomains();
      } else {
        const errData = await res.json().catch(() => ({}));
        addToast(errData.error || 'Failed to bulk delete custom domains', 'error');
      }
    } catch {
      addToast('Network error during bulk delete', 'error');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleCloudflareSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDomainForCloudflare || !cloudflareToken.trim()) {
      addToast('Please enter your Cloudflare API Token.', 'error');
      return;
    }
    setIsSyncingCloudflare(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${API_BASE}/api/v1/admin/email/domains/${selectedDomainForCloudflare.id}/cloudflare-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cloudflareToken: cloudflareToken.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || 'Cloudflare DNS synchronized successfully!', 'success');
        setShowCloudflareModal(false);
        setCloudflareToken('');
        await fetchDomains();
      } else {
        addToast(data.error || 'Failed to sync with Cloudflare', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Network error during Cloudflare sync', 'error');
    } finally {
      setIsSyncingCloudflare(false);
    }
  };

  const handleAddSender = async (e: React.FormEvent) => {
    e.preventDefault();
    const domain = domains.find((d) => d.id === (senderDomainId || domains[0]?.id)) || domains[0];
    if (!domain) {
      addToast('Please register and verify a custom domain before authorizing a sender identity.', 'error');
      return;
    }

    if (domain.verificationStatus !== 'verified' && domain.status !== 'verified') {
      addToast(`Domain ${domain.domainName} is not yet verified. Please verify DNS records first.`, 'warning');
      return;
    }

    const cleanPrefix = senderEmailPrefix.trim().toLowerCase().replace(/@.*$/, '');
    if (!cleanPrefix) {
      addToast('Email prefix is required (e.g. security or noreply)', 'error');
      return;
    }

    const fullEmail = `${cleanPrefix}@${domain.domainName}`;
    setIsSubmittingSender(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/senders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          domainId: domain.id,
          displayName: senderDisplayName.trim() || 'Syntrabase Security',
          emailAddress: fullEmail,
          projectId: senderScope === 'platform' ? 'platform' : (domain.projectId || 'platform'),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSenders((prev) => [data.sender, ...prev.filter((s) => s.id !== data.sender?.id)]);
        addToast(`Sender identity ${fullEmail} authorized in Brevo successfully!`, 'success');
        setShowAddSenderModal(false);
        setSenderDisplayName('');
        setSenderEmailPrefix('security');
        setSenderScope('platform');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'Failed to authorize sender identity in Brevo', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Network error authorizing sender', 'error');
    } finally {
      setIsSubmittingSender(false);
    }
  };

  const handleDeleteSender = async (senderId: string, address: string) => {
    if (!confirm(`Are you sure you want to remove authorized sender ${address}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/senders/${senderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        setSenders((prev) => prev.filter((s) => s.id !== senderId));
        addToast(`Sender ${address} removed successfully.`, 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'Failed to remove sender', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Error deleting sender', 'error');
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchPolicy();
    fetchQueue();
    fetchDomains();
    fetchSenders();
  }, [fetchAccounts, fetchPolicy, fetchQueue, fetchDomains, fetchSenders]);

  // Handle Add Account
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) {
      addToast('Account name is required', 'error');
      return;
    }

    if (newProviderType === 'brevo' && !newApiKey.trim()) {
      addToast('Brevo API key is required', 'error');
      return;
    }

    if (newProviderType === 'smtp' && (!newSmtpHost.trim() || !newSmtpUser.trim() || !newSmtpPass.trim())) {
      addToast('SMTP Host, Username, and App Password are required', 'error');
      return;
    }

    setIsSubmittingAccount(true);
    try {
      const payload: any = {
        providerType: newProviderType,
        accountName: newAccountName.trim(),
      };
      if (newProviderType === 'smtp') {
        payload.smtpHost = newSmtpHost.trim();
        payload.smtpPort = newSmtpPort;
        payload.smtpSecure = newSmtpSecure;
        payload.smtpUser = newSmtpUser.trim();
        payload.smtpPass = newSmtpPass.trim();
        payload.dailyLimit = newSmtpDailyLimit;
      } else {
        payload.apiKey = newApiKey.trim();
      }

      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add provider account');
      }

      addToast(`${newProviderType === 'smtp' ? 'SMTP' : 'Brevo'} account "${data.account.accountName}" validated and added!`, 'success');
      setShowAddAccountModal(false);
      setNewAccountName('');
      setNewApiKey('');
      setNewSmtpUser('');
      setNewSmtpPass('');
      await fetchAccounts();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmittingAccount(false);
    }
  };

  // Handle Edit Account Credentials
  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAccount) return;

    setIsSubmittingEdit(true);
    try {
      const payload: any = {
        accountName: editAccountName.trim() || undefined,
      };

      if (editProviderType === 'smtp') {
        if (!editSmtpPass.trim() && !editSmtpUser.trim()) {
          addToast('SMTP credentials are required', 'error');
          return;
        }
        payload.smtpHost = editSmtpHost.trim();
        payload.smtpPort = editSmtpPort;
        payload.smtpSecure = editSmtpSecure;
        payload.smtpUser = editSmtpUser.trim();
        payload.smtpPass = editSmtpPass.trim();
        payload.dailyLimit = editSmtpDailyLimit;
      } else {
        if (!editApiKey.trim()) {
          addToast('API key is required', 'error');
          return;
        }
        payload.apiKey = editApiKey.trim();
      }

      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${editAccount.id}/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update credentials');
      }

      addToast(`Account "${data.account.accountName}" credentials updated and verified!`, 'success');
      setEditAccount(null);
      setEditApiKey('');
      setEditSmtpPass('');
      await fetchAccounts();
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Set Primary In-Use Dispatcher Account
  const handleSetPrimaryAccount = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${id}/primary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        addToast('Account designated as primary in-use dispatcher', 'success');
        setSelectedAccountId(id);
        await fetchAccounts();
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || 'Failed to designate primary account', 'error');
      }
    } catch {
      addToast('Error updating primary account', 'error');
    }
  };

  // Toggle Account Enabled
  const handleToggleAccount = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ isEnabled: !currentEnabled }),
      });
      if (res.ok) {
        addToast(`Account ${!currentEnabled ? 'enabled' : 'disabled'}`, 'info');
        await fetchAccounts();
      }
    } catch {
      addToast('Failed to update account', 'error');
    }
  };

  // Test / Revalidate Account
  const handleTestAccount = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${id}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (res.ok && data.account.status === 'healthy') {
        addToast('Brevo API key validated successfully! Account healthy.', 'success');
      } else {
        addToast(`Validation failed: ${data.account?.lastError || 'Invalid credentials'}`, 'error');
      }
      await fetchAccounts();
    } catch {
      addToast('Health test failed', 'error');
    }
  };

  // Dispatch Live Test Email from Account
  const handleSendLiveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testSendAccount || !testRecipient) {
      addToast('Recipient email is required', 'error');
      return;
    }
    setIsSendingLiveTest(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${testSendAccount.id}/test-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          toEmail: testRecipient.trim(),
          subject: testSubject.trim(),
          text: testMessage.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || 'Failed to dispatch test email', 'error');
        return;
      }
      addToast(`Test email delivered via ${testSendAccount.providerType?.toUpperCase()}! Remaining cap updated to ${data.account?.remainingCredits ?? 'decremented'}.`, 'success');
      setTestSendAccount(null);
      await fetchAccounts();
    } catch (err: any) {
      addToast(err.message || 'Error transmitting test email', 'error');
    } finally {
      setIsSendingLiveTest(false);
    }
  };

  // Delete Account
  const handleDeleteAccount = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        addToast('Provider account removed', 'info');
        await fetchAccounts();
      }
    } catch {
      addToast('Failed to delete account', 'error');
    }
  };

  // Update Global Policy
  const handleSavePolicy = async (updates: Partial<EmailPlatformPolicy>) => {
    setIsSavingPolicy(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/policy`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setPolicy(data.policy);
        if (updates.emergencyShutdown !== undefined) {
          addToast(
            updates.emergencyShutdown
              ? 'EMERGENCY SHUTDOWN ACTIVATED! All outbound transactional email dispatch halted.'
              : 'Emergency shutdown deactivated. Outbound email dispatch resumed.',
            updates.emergencyShutdown ? 'error' : 'success'
          );
        } else {
          addToast('Email platform policy updated', 'success');
        }
        await fetchAccounts();
        await fetchQueue();
      }
    } catch {
      addToast('Failed to update policy', 'error');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // Flush Outbox Queue Worker
  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/queue/flush`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`Queue worker ran: ${data.sent} sent, ${data.failed} failed/deferred.`, 'info');
        await fetchQueue();
      }
    } catch {
      addToast('Failed to trigger queue flush', 'error');
    } finally {
      setIsFlushingQueue(false);
    }
  };

  const handleSyncAllBrevo = async () => {
    setIsSyncingBrevo(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/sync-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        addToast('Live Brevo account credits & delivery usage synchronized!', 'success');
        await fetchAccounts();
        await fetchQueue();
      } else {
        addToast('Failed to synchronize live Brevo credits', 'error');
      }
    } catch {
      addToast('Error syncing Brevo account', 'error');
    } finally {
      setIsSyncingBrevo(false);
    }
  };

  const handleSyncSingleAccount = async (accountId: string) => {
    try {
      setSyncingAccountId(accountId);
      const res = await fetch(`${API_BASE}/api/v1/admin/email/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        addToast('Account live Brevo usage refreshed!', 'success');
        await fetchAccounts();
      } else {
        addToast('Failed to refresh Brevo usage', 'error');
      }
    } catch {
      addToast('Error syncing account', 'error');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleCheckMessageStatus = async (outboxId: string) => {
    try {
      setCheckingMessageId(outboxId);
      const res = await fetch(`${API_BASE}/api/v1/admin/email/queue/${outboxId}/sync-status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`Brevo SMTP delivery status: ${data.status.toUpperCase()}`, 'info');
        await fetchQueue();
      } else {
        addToast(data.error || 'Failed to check status with Brevo', 'error');
      }
    } catch {
      addToast('Error checking message status', 'error');
    } finally {
      setCheckingMessageId(null);
    }
  };

  const handleRefreshAll = async () => {
    setIsManualRefreshing(true);
    try {
      await fetch(`${API_BASE}/api/v1/admin/email/accounts/sync-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      }).catch(() => {});
      await Promise.all([fetchAccounts(), fetchPolicy(), fetchQueue()]);
      addToast('Live Brevo email infrastructure telemetry refreshed', 'info');
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 700);
    }
  };

  const handlePruneQueue = async () => {
    setIsPruningQueue(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/email/queue/prune`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        addToast(`Pruned ${data.deletedCount || 0} dispatched items from outbox`, 'success');
        await fetchQueue();
      } else {
        addToast('Failed to prune outbox queue', 'error');
      }
    } catch {
      addToast('Error pruning outbox queue', 'error');
    } finally {
      setIsPruningQueue(false);
    }
  };

  // Determine active in-use dispatcher account
  const activeAccount = (selectedAccountId ? accounts.find((a) => a.id === selectedAccountId) : null)
    || accounts.find((a) => a.isPrimary && a.isEnabled)
    || accounts.find((a) => a.status === 'healthy' && (a.dailySentCount || 0) > 0)
    || accounts.find((a) => a.status === 'healthy')
    || accounts[0];

  const totalDailyQuota = activeAccount?.totalDailyQuota !== undefined
    ? Number(activeAccount.totalDailyQuota)
    : (activeAccount?.providerPlanInfo?.credits !== undefined ? Number(activeAccount.providerPlanInfo.credits) : (accounts.length > 0 ? 300 : 0));

  const dailyDispatched = Number(activeAccount?.dailySentCount || 0);
  const remainingCredits = activeAccount?.remainingCredits !== undefined
    ? Number(activeAccount.remainingCredits)
    : Math.max(0, totalDailyQuota - dailyDispatched);
  const percentUsed = totalDailyQuota > 0 ? Math.min(100, Math.round((dailyDispatched / totalDailyQuota) * 100)) : 0;
  const isQuotaExhausted = remainingCredits === 0 && totalDailyQuota > 0;
  const activePlanType = (activeAccount?.providerPlanInfo?.planType || (accounts.length > 0 ? 'free' : 'disconnected')).toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            Global Email Infrastructure
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Brevo HTTPS API delivery, authorized accounts, quota governance, and resilient outbox router.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button variant="outline" onClick={handleRefreshAll} disabled={isManualRefreshing}>
            <RefreshCw
              size={15}
              className={isManualRefreshing ? 'animate-spin' : ''}
              style={{ marginRight: '6px' }}
            />{' '}
            Refresh
          </Button>

          {policy.emergencyShutdown ? (
            <Button
              variant="danger"
              onClick={() => handleSavePolicy({ emergencyShutdown: false })}
              disabled={isSavingPolicy}
            >
              <Power size={15} style={{ marginRight: '6px' }} /> Resume Email Service
            </Button>
          ) : (
            <Button
              variant="outline"
              style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              onClick={() => setShowEmergencyShutdownModal(true)}
              disabled={isSavingPolicy}
            >
              <Power size={15} style={{ marginRight: '6px' }} /> Emergency Shutdown
            </Button>
          )}
        </div>
      </div>

      {/* Emergency Shutdown Alert if active */}
      {policy.emergencyShutdown && (
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            color: 'var(--danger)',
          }}
        >
          <ShieldAlert size={24} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>EMERGENCY SHUTDOWN ACTIVE</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
              All transactional email sending is completely paused platform-wide. Outbox items are being held safely in the durable database queue.
            </div>
          </div>
        </div>
      )}

      {/* Top Telemetry Cards - Exactly 4 in a single row on desktop */}
      <div className="grid-4" style={{ alignItems: 'stretch', marginBottom: '20px' }}>
        {/* Card 1: Provider Plan & Dynamic Credits Countdown */}
        <Card className="has-sections" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '16px 18px 10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {activeAccount?.providerType === 'smtp' ? 'SMTP Quota & Cap' : 'Brevo Live Credits'}
                </span>
                <button
                  onClick={handleSyncAllBrevo}
                  disabled={isSyncingBrevo}
                  title="Synchronize Live Credits and Usage"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px',
                    cursor: 'pointer',
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <RefreshCw size={12} className={isSyncingBrevo ? 'animate-spin' : ''} />
                </button>
                {activeAccount && (
                  <button
                    onClick={() => {
                      setTestSendAccount(activeAccount);
                      setTestRecipient(localStorage.getItem('super_admin_email') || 'admin@syntrabase.internal');
                    }}
                    title="Send Live Test Email to verify quota decrement"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '2px',
                      cursor: 'pointer',
                      color: 'var(--success)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Send size={12} />
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                {accounts.length > 1 && (
                  <select
                    value={activeAccount?.id || ''}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('super_admin_selected_email_account', e.target.value);
                      }
                    }}
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      outline: 'none',
                      maxWidth: '120px',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                    }}
                    title={activeAccount?.accountName ? `Account: ${activeAccount.accountName}` : 'Switch account'}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} {a.isPrimary ? '★' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <Badge
                  variant={policy.emergencyShutdown ? 'danger' : isQuotaExhausted ? 'danger' : activeAccount?.isPrimary ? 'warning' : 'outline'}
                  size="sm"
                  style={{
                    fontSize: '10px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: !policy.emergencyShutdown && !isQuotaExhausted && !activeAccount?.isPrimary && activeAccount?.status === 'healthy' ? 'var(--success)' : undefined,
                    borderColor: !policy.emergencyShutdown && !isQuotaExhausted && !activeAccount?.isPrimary && activeAccount?.status === 'healthy' ? 'var(--success)' : undefined,
                  }}
                >
                  {policy.emergencyShutdown ? (
                    'Shutdown'
                  ) : isQuotaExhausted ? (
                    'Exhausted'
                  ) : activeAccount?.isPrimary ? (
                    <>
                      <Star size={9} style={{ marginRight: '3px', fill: 'currentColor' }} /> Primary
                    </>
                  ) : activeAccount?.status === 'healthy' ? (
                    'Healthy'
                  ) : (
                    activeAccount?.status || 'Active'
                  )}
                </Badge>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: isQuotaExhausted ? 'var(--danger)' : 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {remainingCredits.toLocaleString()}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isQuotaExhausted ? 'var(--danger)' : 'var(--text-secondary)' }}>
                credits left today
              </span>
            </div>

            {/* Sleek 3px Progress Bar */}
            <div style={{ height: '3px', width: '100%', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${percentUsed}%`,
                  backgroundColor: isQuotaExhausted ? 'var(--danger)' : percentUsed > 80 ? 'var(--warning)' : 'var(--success)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>

          <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <span>Today: <strong style={{ color: 'var(--text-primary)' }}>{dailyDispatched} sent</strong> / {totalDailyQuota.toLocaleString()} plan limit</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: activeAccount?.providerPlanInfo?.liveFromBrevo || activeAccount?.providerType === 'smtp' ? '#10b981' : '#f59e0b', display: 'inline-block' }} />
              <strong style={{ color: isQuotaExhausted ? 'var(--danger)' : 'var(--text-primary)' }}>{percentUsed}%</strong> used
            </span>
          </div>
        </Card>

        {/* Card 2: Outbox Queue Depth */}
        <Card className="has-sections" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '16px 18px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Outbox Pending
              </span>
              <Badge variant={policy.emergencyShutdown ? 'danger' : queueMetrics.queueDepth > 0 ? 'warning' : 'neutral'} size="sm" style={{ fontSize: '10px' }}>
                {policy.emergencyShutdown ? 'Queue Frozen' : queueMetrics.queueDepth > 0 ? 'Active Queue' : 'Queue Empty'}
              </Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {queueMetrics.queueDepth}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                in flight
              </span>
            </div>
          </div>
          <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: policy.emergencyShutdown ? 'var(--danger)' : 'var(--text-muted)' }}>
            {policy.emergencyShutdown
              ? 'Dispatch halted by emergency platform shutdown.'
              : `${queueMetrics.queued} queued pending, ${queueMetrics.deferred} deferred retry`}
          </div>
        </Card>

        {/* Card 3: Total Sent via Router */}
        <Card className="has-sections" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '16px 18px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Dispatched
              </span>
              <Badge variant="outline" size="sm" style={{ fontSize: '10px', color: 'var(--success)', borderColor: 'var(--success)' }}>
                Durable Outbox
              </Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {queueMetrics.sent}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                messages
              </span>
            </div>
          </div>
          <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {queueMetrics.delivered !== undefined && queueMetrics.delivered > 0 ? `${queueMetrics.delivered} verified delivered • ` : ''}{queueMetrics.failed} failed / rejections
          </div>
        </Card>

        {/* Card 4: Global Sending State */}
        <Card className="has-sections" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '140px', overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '16px 18px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Global Gateway
              </span>
              <Badge variant={policy.globalSendingEnabled && !policy.emergencyShutdown ? 'success' : 'danger'} size="sm">
                {policy.globalSendingEnabled && !policy.emergencyShutdown ? 'OPERATIONAL' : 'PAUSED'}
              </Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {accounts.filter((a) => a.isEnabled).length}
              </span>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                accounts active
              </span>
            </div>
          </div>
          <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Cap: {policy.dailyProjectCap} emails/day/project
          </div>
        </Card>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-default)', paddingBottom: '8px' }}>
        <Button
          id="email-tab-accounts"
          variant={activeTab === 'accounts' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('accounts')}
        >
          <Server size={15} style={{ marginRight: '6px' }} /> Provider Accounts ({accounts.length})
        </Button>
        <Button
          id="email-tab-queue"
          variant={activeTab === 'queue' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('queue')}
        >
          <Layers size={15} style={{ marginRight: '6px' }} /> Outbox Queue ({outboxItems.length > 0 ? outboxItems.length : queueMetrics.queueDepth})
        </Button>
        <Button
          id="email-tab-policy"
          variant={activeTab === 'policy' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('policy')}
        >
          <Sliders size={15} style={{ marginRight: '6px' }} /> Routing & Policy
        </Button>
        <Button
          id="email-tab-domains"
          variant={activeTab === 'domains' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('domains')}
        >
          <Globe size={15} style={{ marginRight: '6px' }} /> Custom Sender Domains ({domains.length})
        </Button>
        <Button
          id="email-tab-senders"
          variant={activeTab === 'senders' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('senders')}
        >
          <Send size={15} style={{ marginRight: '6px' }} /> Authorized Senders ({senders.length})
        </Button>
      </div>

      {/* TAB 1: PROVIDER ACCOUNTS */}
      {activeTab === 'accounts' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <div>
              <CardTitle>Authorized Email Provider Accounts</CardTitle>
              <CardDescription>
                Credentials are encrypted with AES-256-GCM at rest. Secret keys are never exposed in plaintext.
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddAccountModal(true)}>
              <Plus size={15} style={{ marginRight: '6px' }} /> Add Brevo Account
            </Button>
          </CardHeader>

          <div style={{ padding: '16px' }}>
            {isLoadingAccounts ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading provider accounts...
              </div>
            ) : accounts.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-default)',
                }}
              >
                <Mail size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>No Email Provider Configured</h3>
                <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', marginInline: 'auto' }}>
                  Add your Brevo API key to enable verified HTTPS transactional email delivery over port 443 without needing port 25.
                </p>
                <Button onClick={() => setShowAddAccountModal(true)}>
                  <Plus size={15} style={{ marginRight: '6px' }} /> Add Brevo Account
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account / Identity</TableHead>
                    <TableHead>Masked Credential</TableHead>
                    <TableHead>Status &amp; Circuit</TableHead>
                    <TableHead>Observed Usage &amp; Quota</TableHead>
                    <TableHead>Domains &amp; Senders</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acc: any) => (
                    <TableRow key={acc.id}>
                      <TableCell>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{acc.accountName}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor: acc.providerType === 'smtp' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                              color: acc.providerType === 'smtp' ? '#a855f7' : '#3b82f6',
                              border: `1px solid ${acc.providerType === 'smtp' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                            }}
                          >
                            {acc.providerType === 'smtp' ? 'SMTP Relay' : 'Brevo API'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {acc.accountEmail || 'No verified email'}
                          {acc.companyName ? ` (${acc.companyName})` : ''}
                        </div>
                        {acc.isSharedQuotaPool && (
                          <div
                            style={{
                              marginTop: '4px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#f59e0b',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                            }}
                          >
                            <AlertTriangle size={11} /> Shares quota pool with {acc.sharedWithAccountName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <code style={{ fontSize: '0.8rem', padding: '2px 6px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '4px' }}>
                          {acc.maskedApiKey}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          {acc.isPrimary && (
                            <Badge variant="warning" style={{ fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Star size={10} style={{ fill: 'currentColor' }} /> Primary In-Use
                            </Badge>
                          )}
                          {acc.status === 'healthy' ? (
                            <Badge variant="outline" style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>
                              <CheckCircle2 size={12} style={{ marginRight: '4px' }} /> Healthy
                            </Badge>
                          ) : acc.status === 'quota_exhausted' ? (
                            <Badge variant="outline" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}>
                              <AlertTriangle size={12} style={{ marginRight: '4px' }} /> Quota Exhausted
                            </Badge>
                          ) : acc.status === 'rate_limited' ? (
                            <Badge variant="outline" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}>
                              <Clock size={12} style={{ marginRight: '4px' }} /> Rate Limited
                            </Badge>
                          ) : acc.status === 'invalid_credentials' ? (
                            <Badge variant="outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
                              <XCircle size={12} style={{ marginRight: '4px' }} /> Auth Failed
                            </Badge>
                          ) : (
                            <Badge variant="neutral">Disabled</Badge>
                          )}
                          {acc.pausedUntil && new Date(acc.pausedUntil) > new Date() && (
                            <span style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <Clock size={10} /> Paused until {new Date(acc.pausedUntil).toLocaleTimeString()}
                            </span>
                          )}
                          {acc.lastError && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--danger)', maxWidth: '180px', wordBreak: 'break-word' }}>
                              {acc.lastError}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          Remaining: <span style={{ color: (acc.remainingCredits ?? Math.max(0, (acc.providerPlanInfo?.credits ?? 300) - (acc.dailySentCount || 0))) === 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {(acc.remainingCredits ?? Math.max(0, (acc.providerPlanInfo?.credits ?? 300) - (acc.dailySentCount || 0))).toLocaleString()}
                          </span> / {(acc.totalDailyQuota ?? (acc.providerPlanInfo?.credits ?? 300)).toLocaleString()} daily
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Today: {acc.dailySentCount ?? 0} sent • Monthly: {acc.monthlySentCount ?? 0} sent
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span>Tier: {acc.providerPlanInfo?.planType ? `Brevo ${acc.providerPlanInfo.planType.toUpperCase()}` : 'Brevo FREE'}</span>
                          {acc.providerPlanInfo?.liveFromBrevo && (
                            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }}>
                              LIVE BREVO
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '220px' }}>
                          {acc.associatedDomains && acc.associatedDomains.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                              {acc.associatedDomains.map((d: any) => (
                                <span
                                  key={d.id}
                                  style={{
                                    fontSize: '0.7rem',
                                    padding: '1px 5px',
                                    borderRadius: '3px',
                                    backgroundColor: 'var(--bg-surface-subtle)',
                                    border: '1px solid var(--border-subtle)',
                                    color: d.verificationStatus === 'verified' ? 'var(--success)' : 'var(--text-secondary)',
                                  }}
                                  title={`Project: ${d.projectId} | Status: ${d.verificationStatus}`}
                                >
                                  {d.domainName}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No domains bound</span>
                          )}
                          {acc.authorizedSenders && acc.authorizedSenders.length > 0 && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              {acc.authorizedSenders.length} sender identity(ies)
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncSingleAccount(acc.id)}
                            disabled={syncingAccountId === acc.id}
                            title="Synchronize live credits and daily usage from Brevo API"
                          >
                            <RefreshCw size={13} className={syncingAccountId === acc.id ? 'animate-spin' : ''} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetPrimaryAccount(acc.id)}
                            style={{ color: acc.isPrimary ? '#f59e0b' : 'var(--text-muted)', borderColor: acc.isPrimary ? '#f59e0b' : undefined }}
                            title={acc.isPrimary ? 'Designated as Primary Dispatcher' : 'Set as Primary In-Use Dispatcher'}
                          >
                            <Star size={13} style={acc.isPrimary ? { fill: '#f59e0b' } : {}} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestAccount(acc.id)}
                            title="Verify connection"
                          >
                            <Power size={13} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTestSendAccount(acc);
                              setTestRecipient(localStorage.getItem('super_admin_email') || 'admin@syntrabase.internal');
                            }}
                            title="Send Live Test Email via this account"
                            style={{ color: 'var(--success)' }}
                          >
                            <Send size={13} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditAccount(acc);
                              setEditAccountName(acc.accountName);
                              setEditProviderType(acc.providerType || 'brevo');
                              setEditApiKey('');
                              setEditSmtpPass('');
                              if (acc.accountEmail) setEditSmtpUser(acc.accountEmail);
                            }}
                            title="Edit Credentials"
                          >
                            <KeyRound size={13} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleAccount(acc.id, acc.isEnabled)}
                            style={{ color: acc.isEnabled ? 'var(--warning)' : 'var(--success)' }}
                            title={acc.isEnabled ? 'Disable' : 'Enable'}
                          >
                            <Power size={13} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteAccount(acc.id)}
                            style={{ color: 'var(--danger)' }}
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* TAB 2: OUTBOX QUEUE */}
      {activeTab === 'queue' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <div>
              <CardTitle>Durable Outbox Queue</CardTitle>
              <CardDescription>
                ACID transactional mail queue. Handles temporary failure retries with exponential backoff and jitter.
              </CardDescription>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button onClick={handleFlushQueue} disabled={isFlushingQueue || policy.emergencyShutdown || !policy.globalSendingEnabled}>
                <Send size={15} style={{ marginRight: '6px' }} /> {policy.emergencyShutdown ? 'Queue Halted (Shutdown)' : isFlushingQueue ? 'Processing...' : 'Flush Queue Now'}
              </Button>
              {outboxItems.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handlePruneQueue}
                  disabled={isPruningQueue}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                >
                  <Trash2 size={15} style={{ marginRight: '6px' }} /> {isPruningQueue ? 'Pruning...' : 'Prune Dispatched'}
                </Button>
              )}
            </div>
          </CardHeader>

          <div style={{ padding: '16px' }}>
            {outboxItems.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No messages in outbox queue.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delivery Status</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject / Action</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Provider Msg ID</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outboxItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.status === 'delivered' ? (
                          <Badge variant="outline" style={{ color: '#10b981', borderColor: '#10b981', background: 'rgba(16, 185, 129, 0.1)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={11} /> Delivered (Brevo Confirmed)
                          </Badge>
                        ) : item.status === 'sent' ? (
                          <Badge variant="outline" style={{ color: '#3b82f6', borderColor: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Send size={11} /> Dispatched to Gateway
                          </Badge>
                        ) : item.status === 'queued' ? (
                          <Badge variant="neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} /> Queued (Pending)
                          </Badge>
                        ) : item.status === 'deferred' ? (
                          <Badge variant="outline" style={{ color: 'var(--warning)', borderColor: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <RefreshCw size={11} /> Deferred (Retry)
                          </Badge>
                        ) : item.status === 'bounced' ? (
                          <Badge variant="outline" style={{ color: '#ef4444', borderColor: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <AlertTriangle size={11} /> Bounced
                          </Badge>
                        ) : (
                          <Badge variant="danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <XCircle size={11} /> Delivery Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell style={{ fontWeight: 500 }}>{item.recipientEmail}</TableCell>
                      <TableCell>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{item.subject}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Type: {item.actionType} | From: {item.senderEmail}
                        </div>
                      </TableCell>
                      <TableCell style={{ fontSize: '0.85rem' }}>
                        {item.attempts} / {item.maxAttempts}
                      </TableCell>
                      <TableCell>
                        {item.providerMessageId ? (
                          <code style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all' }} title={`Confirmed Provider ID: ${item.providerMessageId}`}>
                            {item.providerMessageId.length > 28 ? `${item.providerMessageId.substring(0, 28)}...` : item.providerMessageId}
                          </code>
                        ) : item.errorMessage ? (
                          <span style={{ fontSize: '0.74rem', color: 'var(--danger)', wordBreak: 'break-word' }} title={item.errorMessage}>
                            {item.errorMessage.length > 35 ? `${item.errorMessage.substring(0, 35)}...` : item.errorMessage}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pending Dispatch</span>
                        )}
                      </TableCell>
                      <TableCell style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(item.createdAt).toLocaleTimeString()}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCheckMessageStatus(item.id)}
                          disabled={checkingMessageId === item.id}
                          title="Query live Brevo SMTP API delivery status for this message"
                          style={{ fontSize: '0.72rem', padding: '2px 8px', height: '26px' }}
                        >
                          <Search size={11} style={{ marginRight: '4px' }} className={checkingMessageId === item.id ? 'animate-spin' : ''} />
                          {checkingMessageId === item.id ? 'Checking...' : 'Check Status'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* TAB 3: ROUTING & POLICY */}
      {activeTab === 'policy' && (
        <Card>
          <CardHeader>
            <CardTitle>Platform Email Delivery Policy</CardTitle>
            <CardDescription>
              Control global throughput, emergency stop, and project sending quotas.
            </CardDescription>
          </CardHeader>
          <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
            {/* Emergency Shutdown Platform Switch */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px',
                backgroundColor: policy.emergencyShutdown ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-surface-subtle)',
                border: policy.emergencyShutdown ? '1px solid var(--danger)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontWeight: 700, color: policy.emergencyShutdown ? 'var(--danger)' : 'var(--text-primary)' }}>
                    Cluster Emergency Shutdown
                  </div>
                  <Badge variant={policy.emergencyShutdown ? 'danger' : 'outline'} size="sm">
                    {policy.emergencyShutdown ? 'ACTIVE (DISPATCH HALTED)' : 'STANDBY'}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.8rem', color: policy.emergencyShutdown ? 'var(--danger)' : 'var(--text-secondary)', marginTop: '4px' }}>
                  Immediate freeze of all outbound transactional dispatch cluster-wide. Queued messages remain preserved.
                </div>
              </div>
              {policy.emergencyShutdown ? (
                <Button
                  variant="outline"
                  style={{ borderColor: 'var(--success)', color: 'var(--success)' }}
                  onClick={() => handleSavePolicy({ emergencyShutdown: false })}
                  disabled={isSavingPolicy}
                >
                  <Power size={14} style={{ marginRight: '6px' }} /> Resume Dispatch
                </Button>
              ) : (
                <Button
                  variant="outline"
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  onClick={() => setShowEmergencyShutdownModal(true)}
                  disabled={isSavingPolicy}
                >
                  <Power size={14} style={{ marginRight: '6px' }} /> Emergency Shutdown
                </Button>
              )}
            </div>

            {/* Global Switch */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Global Outbound Delivery</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Master switch to enable or pause all external transactional email dispatch.
                </div>
              </div>
              <Button
                variant={policy.globalSendingEnabled ? 'primary' : 'outline'}
                onClick={() => handleSavePolicy({ globalSendingEnabled: !policy.globalSendingEnabled })}
                disabled={isSavingPolicy}
              >
                {policy.globalSendingEnabled ? 'Enabled' : 'Paused'}
              </Button>
            </div>

            {/* Quota & Rate Limit Controls */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Daily Project Sending Cap (Emails / 24h)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={policy.dailyProjectCap}
                  onChange={(e) => setPolicy({ ...policy, dailyProjectCap: parseInt(e.target.value, 10) || 100 })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Platform fallback daily quota enforced on managed tenant gateways.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Monthly Project Cap (Emails / Mo)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={policy.monthlyProjectCap || 15000}
                  onChange={(e) => setPolicy({ ...policy, monthlyProjectCap: parseInt(e.target.value, 10) || 1000 })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Platform-wide monthly cap across all project environments.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Burst Rate Limit (Emails / Min)
                </label>
                <Input
                  type="number"
                  min={1}
                  value={policy.burstRateLimitPerMinute || 60}
                  onChange={(e) => setPolicy({ ...policy, burstRateLimitPerMinute: parseInt(e.target.value, 10) || 60 })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Max allowable burst dispatch frequency per project per minute.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Allowed Custom Domains / Project
                </label>
                <Input
                  type="number"
                  min={0}
                  value={policy.allowedDomainsPerProject ?? 5}
                  onChange={(e) => setPolicy({ ...policy, allowedDomainsPerProject: parseInt(e.target.value, 10) || 0 })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Maximum custom sender domains a project can register and verify.
                </span>
              </div>
            </div>

            {/* Enforcement Policy & Verification */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Quota Exhaustion Enforcement Action
                </label>
                <select
                  value={policy.enforcementAction || 'reject'}
                  onChange={(e) => setPolicy({ ...policy, enforcementAction: e.target.value as 'throttle_and_queue' | 'reject' })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="reject">Reject Immediately (429 Email Quota Exceeded)</option>
                  <option value="throttle_and_queue">Throttle &amp; Buffer (Queue in Outbox with Delay)</option>
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Action executed when a project breaches daily or monthly allowances.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Maximum Delivery Retries
                </label>
                <Input
                  type="number"
                  min={1}
                  value={policy.maxRetryAttempts}
                  onChange={(e) => setPolicy({ ...policy, maxRetryAttempts: parseInt(e.target.value, 10) || 5 })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Number of retry attempts with exponential backoff before marking failed.
                </span>
              </div>
            </div>

            {/* Verification Requirement Toggle */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface-subtle)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                  Require Sender Domain &amp; Address Verification
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  When enabled, projects can only dispatch from verified DNS domains or validated sender identities.
                </div>
              </div>
              <input
                type="checkbox"
                checked={policy.requireEmailVerification ?? true}
                onChange={(e) => setPolicy({ ...policy, requireEmailVerification: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            <Button
              onClick={() => handleSavePolicy({
                dailyProjectCap: policy.dailyProjectCap,
                monthlyProjectCap: policy.monthlyProjectCap,
                burstRateLimitPerMinute: policy.burstRateLimitPerMinute,
                enforcementAction: policy.enforcementAction,
                allowedDomainsPerProject: policy.allowedDomainsPerProject,
                requireEmailVerification: policy.requireEmailVerification,
                maxRetryAttempts: policy.maxRetryAttempts,
              })}
              disabled={isSavingPolicy}
              style={{ alignSelf: 'flex-start' }}
            >
              Save Policy Configuration
            </Button>
          </div>
        </Card>
      )}

      {/* TAB 4: CUSTOM SENDER DOMAINS */}
      {activeTab === 'domains' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <CardTitle>Custom Sender Domains &amp; DNS Parameters</CardTitle>
              <CardDescription>
                Configure verified custom sending domains with DKIM, SPF, and MX authentication.
              </CardDescription>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {selectedDomainIds.length > 0 && (
                <Button
                  id="bulk-delete-domains-btn"
                  variant="danger"
                  size="sm"
                  onClick={handleBulkDeleteDomains}
                  disabled={isBulkDeleting}
                >
                  <Trash2 size={14} style={{ marginRight: '6px' }} />
                  {isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedDomainIds.length})`}
                </Button>
              )}
              <Button onClick={() => setShowAddDomainModal(true)}>
                <Plus size={15} style={{ marginRight: '6px' }} /> Register Custom Domain
              </Button>
            </div>
          </CardHeader>

          <div style={{ padding: '16px' }}>
            {isLoadingDomains ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading custom domains...
              </div>
            ) : domains.length === 0 ? (
              <div
                style={{
                  padding: '48px 24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--border-default)',
                }}
              >
                <Globe size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>No Custom Domains Configured</h3>
                <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '480px', marginInline: 'auto' }}>
                  Register a custom sending domain (e.g. <code>mail.yourdomain.com</code>) to brand transactional emails and achieve 100% inbox placement with DKIM &amp; SPF signatures.
                </p>
                <Button onClick={() => setShowAddDomainModal(true)}>
                  <Plus size={15} style={{ marginRight: '6px' }} /> Register Custom Domain
                </Button>
              </div>
            ) : (() => {
              const filteredDomains = domainSearchFilter.trim()
                ? domains.filter((d) =>
                    (d.domainName || '').toLowerCase().includes(domainSearchFilter.toLowerCase().trim()) ||
                    (d.projectName || '').toLowerCase().includes(domainSearchFilter.toLowerCase().trim())
                  )
                : domains;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Filter & Actions Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px', maxWidth: '450px' }}>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <Search
                          size={14}
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                            pointerEvents: 'none',
                          }}
                        />
                        <input
                          type="text"
                          placeholder={`Filter ${domains.length} domains by name or tenant...`}
                          value={domainSearchFilter}
                          onChange={(e) => setDomainSearchFilter(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '7px 10px 7px 32px',
                            fontSize: '0.8rem',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                        />
                      </div>
                      {domainSearchFilter && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setDomainSearchFilter('')}
                          style={{ fontSize: '0.74rem', whiteSpace: 'nowrap' }}
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={filteredDomains.length > 0 && selectedDomainIds.length === filteredDomains.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDomainIds(filteredDomains.map((d) => d.id));
                            } else {
                              setSelectedDomainIds([]);
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Select All ({filteredDomains.length})</span>
                      </label>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={handleToggleAllDomains}
                        style={{ fontSize: '0.78rem', gap: '5px' }}
                      >
                        {expandedDomainIds.length === domains.length ? (
                          <>
                            <ChevronUp size={13} /> Collapse All DNS
                          </>
                        ) : (
                          <>
                            <ChevronDown size={13} /> Expand All DNS
                          </>
                        )}
                      </Button>

                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {selectedDomainIds.length > 0 ? `${selectedDomainIds.length} selected · ` : ''}
                        {filteredDomains.length} of {domains.length} domains
                      </span>
                    </div>
                  </div>

                  {/* Constrained Scrollable List for 24+ Domains */}
                  {filteredDomains.length === 0 ? (
                    <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No custom domains matching &ldquo;{domainSearchFilter}&rdquo;
                      <div style={{ marginTop: '8px' }}>
                        <Button variant="ghost" size="xs" onClick={() => setDomainSearchFilter('')}>
                          Reset Filter
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="custom-scrollbar"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        maxHeight: 'calc(100vh - 280px)',
                        minHeight: '320px',
                        overflowY: 'auto',
                        paddingRight: '6px',
                      }}
                    >
                      {filteredDomains.map((dom) => {
                        const isChecked = selectedDomainIds.includes(dom.id);
                        const isExpanded = expandedDomainIds.includes(dom.id);

                        return (
                          <Card
                            key={dom.id}
                            style={{
                              border: isChecked ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                              background: 'var(--bg-card)',
                              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                              overflow: 'hidden',
                              padding: 0,
                              flexShrink: 0,
                              boxShadow: 'var(--shadow-sm)',
                            }}
                          >
                            <div
                              style={{
                                padding: '16px 20px',
                                minHeight: '68px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '14px',
                                borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none',
                                background: isChecked ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedDomainIds((prev) => [...prev, dom.id]);
                                    } else {
                                      setSelectedDomainIds((prev) => prev.filter((id) => id !== dom.id));
                                    }
                                  }}
                                  style={{ cursor: 'pointer', flexShrink: 0 }}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                                    <Globe size={16} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                                    <span
                                      style={{
                                        fontSize: '0.98rem',
                                        fontWeight: 700,
                                        color: 'var(--text-primary)',
                                        maxWidth: '320px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                      title={dom.domainName}
                                    >
                                      {dom.domainName}
                                    </span>
                                    <Badge
                                      variant={dom.verificationStatus === 'verified' ? 'success' : dom.verificationStatus === 'failed' ? 'danger' : 'warning'}
                                      size="sm"
                                    >
                                      {dom.verificationStatus.toUpperCase()}
                                    </Badge>
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Scope: {dom.projectName ? `Tenant (${dom.projectName})` : 'Platform Global'} · Registered: {new Date(dom.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedDomainForCloudflare(dom);
                                    setShowCloudflareModal(true);
                                  }}
                                  style={{ gap: '5px', fontSize: '0.78rem' }}
                                >
                                  <Zap size={13} color="#f59e0b" />
                                  Cloudflare
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleVerifyDomain(dom.id)}
                                  disabled={verifyingDomainId === dom.id}
                                  style={{ fontSize: '0.78rem' }}
                                >
                                  <RefreshCw size={12} className={verifyingDomainId === dom.id ? 'animate-spin' : ''} style={{ marginRight: '4px' }} />
                                  {verifyingDomainId === dom.id ? 'Verifying...' : 'Verify DNS'}
                                </Button>
                                <Button
                                  variant={isExpanded ? 'primary' : 'ghost'}
                                  size="sm"
                                  onClick={() => toggleDomainExpanded(dom.id)}
                                  style={{ gap: '4px', fontSize: '0.78rem' }}
                                >
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  DNS {isExpanded ? 'Hide' : 'Records'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDomain(dom.id)}
                                  style={{ color: 'var(--accent-rose)' }}
                                  title="Delete custom domain"
                                >
                                  <Trash2 size={13} />
                                </Button>
                              </div>
                            </div>

                            {/* Collapsible DNS Parameters Section */}
                            {isExpanded && (
                              <div style={{ padding: '14px 18px', backgroundColor: 'var(--bg-surface-subtle)' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                  DNS Authentication Records for {dom.domainName}:
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                    <colgroup>
                                      <col style={{ width: '110px' }} />
                                      <col style={{ width: '220px' }} />
                                      <col />
                                      <col style={{ width: '100px' }} />
                                    </colgroup>
                                    <thead>
                                      <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
                                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Type</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Host / Name</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Required Target Value</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'right' }}>Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>TXT (DKIM)</td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`mail._domainkey.${dom.domainName}`}>
                                          mail._domainkey.{dom.domainName}
                                        </td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ...">
                                          v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQ...
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}><Badge variant="outline" size="sm">DKIM Key</Badge></td>
                                      </tr>
                                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>TXT (SPF)</td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`@ / ${dom.domainName}`}>
                                          @ / {dom.domainName}
                                        </td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="v=spf1 include:spf.brevo.com ~all">
                                          v=spf1 include:spf.brevo.com ~all
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}><Badge variant="outline" size="sm">SPF Record</Badge></td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>CNAME</td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`tracking.${dom.domainName}`}>
                                          tracking.{dom.domainName}
                                        </td>
                                        <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="tracking.brevo.com">
                                          tracking.brevo.com
                                        </td>
                                        <td style={{ padding: '8px', textAlign: 'right' }}><Badge variant="outline" size="sm">Click Tracking</Badge></td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </Card>
      )}

      {/* TAB 5: AUTHORIZED SENDER IDENTITIES */}
      {activeTab === 'senders' && (
        <Card>
          <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row' }}>
            <div>
              <CardTitle>Platform &amp; Tenant Authorized Senders</CardTitle>
              <CardDescription>
                Cryptographically registered outbound identities with Brevo. Transactional emails, password resets, and verification messages dispatch from these addresses.
              </CardDescription>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchSenders}
                disabled={isLoadingSenders}
                id="btn-refresh-senders"
              >
                <RefreshCw size={14} className={isLoadingSenders ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddSenderModal(true)}
                id="btn-authorize-sender"
              >
                <Plus size={14} style={{ marginRight: '6px' }} />
                Authorize Sender Identity
              </Button>
            </div>
          </CardHeader>

          {/* Quick Notice Card */}
          <div style={{ margin: '0 24px 20px 24px', padding: '12px 16px', borderRadius: '8px', background: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={20} color="#10b981" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              <strong>Platform Default Fallback:</strong> If no authorized senders are registered, system emails (password resets, invitations) will fall back to your connected Brevo account owner email. Authorizing a sender here (such as <code style={{ color: 'var(--text-primary)' }}>security@example.com</code>) allows the platform to dispatch cleanly with branded sender headers.
            </div>
          </div>

          <div style={{ padding: '0 24px 24px 24px' }}>
            {isLoadingSenders ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                Loading authorized senders...
              </div>
            ) : senders.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border-default)', borderRadius: '12px' }}>
                <Mail size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600 }}>No Authorized Sender Identities</h4>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto' }}>
                  Authorize a custom sender address on your verified domain (e.g. <code>security@example.com</code> or <code>noreply@example.com</code>) to dispatch production transactional emails.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddSenderModal(true)}
                >
                  <Plus size={14} style={{ marginRight: '6px' }} />
                  Authorize First Sender
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sender Identity</TableHead>
                    <TableHead>Domain &amp; Scope</TableHead>
                    <TableHead>Brevo Sender ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead style={{ textAlign: 'right' }}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {senders.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#818cf8',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <Send size={15} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                              {s.displayName || s.display_name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              {s.emailAddress || s.email_address}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Globe size={13} color="var(--text-muted)" />
                          <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                            {(s.emailAddress || s.email_address || '').split('@')[1] || 'Domain'}
                          </span>
                          <Badge variant="outline" size="sm">
                            {(s.projectId || s.project_id) === 'platform' || !(s.projectId || s.project_id) ? 'Platform' : `Project: ${(s.projectId || s.project_id).slice(0, 8)}`}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code style={{ fontSize: '0.78rem', padding: '2px 6px', background: 'var(--bg-subtle)', borderRadius: '4px' }}>
                          {s.brevoSenderId || s.brevo_sender_id || 'Registered'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="success" size="sm">
                          <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
                          {s.status || 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(s.createdAt || s.created_at || Date.now()).toLocaleDateString()}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: '#ef4444' }}
                          onClick={() => handleDeleteSender(s.id, s.emailAddress || s.email_address)}
                          title="Remove authorized sender"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      )}

      {/* AUTHORIZE SENDER IDENTITY MODAL */}
      {showAddSenderModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAddSenderModal(false)}
          title="Authorize New Sender Identity"
        >
          <form onSubmit={handleAddSender} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Register a verified outbound email address with Brevo. Password reset tokens, notifications, and customer emails will dispatch from this address.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Sender Scope
              </label>
              <select
                value={senderScope}
                onChange={(e) => setSenderScope(e.target.value as 'platform' | 'project')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-subtle, #1e293b)',
                  border: '1px solid var(--border-default, #334155)',
                  color: 'var(--text-primary, #ffffff)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="platform">Super Admin Platform (Password Resets, Invitations, System Alerts)</option>
                <option value="project">Tenant / Project Specific Sender</option>
              </select>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {senderScope === 'platform'
                  ? 'This sender will be used exclusively by the platform to dispatch Developer Console password reset emails, system invitations, and security alerts.'
                  : 'This sender will be scoped to the tenant project owning the selected domain.'}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Sender Domain
              </label>
              {domains.length === 0 ? (
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '0.82rem' }}>
                  No custom sender domains registered yet. Please register a domain in the <strong>Custom Sender Domains</strong> tab first.
                </div>
              ) : (
                <select
                  value={senderDomainId || domains[0]?.id || ''}
                  onChange={(e) => setSenderDomainId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-subtle, #1e293b)',
                    border: '1px solid var(--border-default, #334155)',
                    color: 'var(--text-primary, #ffffff)',
                    fontSize: '0.85rem',
                  }}
                  required
                >
                  {domains.map((dom) => {
                    const isVerified = dom.verificationStatus === 'verified' || dom.status === 'verified';
                    const isPlatform = dom.projectId === 'platform' || !dom.projectName;
                    const scopeLabel = isPlatform ? '[Super Admin Platform]' : `[Project: ${dom.projectName || dom.projectId}]`;
                    return (
                      <option key={dom.id} value={dom.id}>
                        {scopeLabel} {dom.domainName} ({isVerified ? 'Verified' : 'Pending DNS'})
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Sender Display Name
              </label>
              <Input
                placeholder="e.g. Syntrabase Security or Platform Team"
                value={senderDisplayName}
                onChange={(e) => setSenderDisplayName(e.target.value)}
                required
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                The human-readable sender name recipients see in their inbox.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Sender Email Prefix
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Input
                  placeholder="e.g. security or noreply"
                  value={senderEmailPrefix}
                  onChange={(e) => setSenderEmailPrefix(e.target.value)}
                  required
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.88rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  @{domains.find((d) => d.id === (senderDomainId || domains[0]?.id))?.domainName || 'example.com'}
                </span>
              </div>
            </div>

            {/* Live Preview Box */}
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-subtle, rgba(255, 255, 255, 0.03))', border: '1px solid var(--border-default)', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Preview in email client: </span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {senderDisplayName.trim() || 'Syntrabase Security'}
              </strong>{' '}
              <code style={{ color: '#818cf8' }}>
                &lt;{(senderEmailPrefix.trim() || 'security').replace(/@.*$/, '')}@{domains.find((d) => d.id === (senderDomainId || domains[0]?.id))?.domainName || 'example.com'}&gt;
              </code>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSubmittingSender}
                onClick={() => setShowAddSenderModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmittingSender || domains.length === 0}
              >
                <Send size={13} style={{ marginRight: '4px' }} />
                {isSubmittingSender ? 'Authorizing in Brevo...' : 'Authorize Sender'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* REGISTER CUSTOM DOMAIN MODAL */}
      {showAddDomainModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowAddDomainModal(false)}
          title="Register Custom Sender Domain"
        >
          <form onSubmit={handleRegisterDomain} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Add a custom domain or subdomain (e.g. <code>mail.yourcompany.com</code>). DNS records will be generated for Brevo verification.
            </p>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Sender Domain Name
              </label>
              <Input
                placeholder="e.g. mail.syntrabase.app"
                value={newDomainName}
                onChange={(e) => setNewDomainName(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                Associated Brevo Account (Optional)
              </label>
              <select
                value={newDomainAccount}
                onChange={(e) => setNewDomainAccount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="">Default Platform Brevo Account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName} ({a.maskedApiKey})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <Button variant="ghost" onClick={() => setShowAddDomainModal(false)} disabled={isSubmittingDomain}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingDomain}>
                {isSubmittingDomain ? 'Registering...' : 'Register Domain'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ADD ACCOUNT MODAL */}
      <Modal
        isOpen={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        title="Add Email Provider Account"
      >
        <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Provider Selection Tabs */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>
              Provider Engine
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setNewProviderType('brevo')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${newProviderType === 'brevo' ? '#3b82f6' : 'var(--border-color)'}`,
                  background: newProviderType === 'brevo' ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-card)',
                  color: newProviderType === 'brevo' ? '#3b82f6' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                Brevo API (REST v3)
              </button>
              <button
                type="button"
                onClick={() => setNewProviderType('smtp')}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${newProviderType === 'smtp' ? '#a855f7' : 'var(--border-color)'}`,
                  background: newProviderType === 'smtp' ? 'rgba(168, 85, 247, 0.12)' : 'var(--bg-card)',
                  color: newProviderType === 'smtp' ? '#a855f7' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                SMTP Relay (Gmail / Custom)
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Account Identifier Name
            </label>
            <Input
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              placeholder={newProviderType === 'smtp' ? 'e.g. Gmail Support Relay' : 'e.g. Production Brevo Account'}
              required
            />
          </div>

          {newProviderType === 'brevo' ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Brevo API Key (v3)
                </label>
                <Input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="xkeysib-..."
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Found in Brevo Console &gt; SMTP &amp; API &gt; API Keys.
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    SMTP Host
                  </label>
                  <Input
                    value={newSmtpHost}
                    onChange={(e) => setNewSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Port
                  </label>
                  <Input
                    type="number"
                    value={newSmtpPort}
                    onChange={(e) => setNewSmtpPort(parseInt(e.target.value, 10) || 465)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  SMTP Username / Email
                </label>
                <Input
                  type="email"
                  value={newSmtpUser}
                  onChange={(e) => setNewSmtpUser(e.target.value)}
                  placeholder="your-account@gmail.com"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  SMTP Password / App Password
                </label>
                <Input
                  type="password"
                  value={newSmtpPass}
                  onChange={(e) => setNewSmtpPass(e.target.value)}
                  placeholder="16-character Google App Password"
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  For Gmail, generate via: Google Account &gt; Security &gt; 2-Step Verification &gt; App Passwords.
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Daily Quota Limit
                  </label>
                  <Input
                    type="number"
                    value={newSmtpDailyLimit}
                    onChange={(e) => setNewSmtpDailyLimit(parseInt(e.target.value, 10) || 500)}
                    placeholder="500"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '18px' }}>
                    <input
                      type="checkbox"
                      checked={newSmtpSecure}
                      onChange={(e) => setNewSmtpSecure(e.target.checked)}
                      style={{ width: '16px', height: '16px', accentColor: '#a855f7' }}
                    />
                    Use SSL / TLS (Port 465)
                  </label>
                </div>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.08)', border: '1px solid rgba(168, 85, 247, 0.25)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                💡 <strong>Custom Sender Domain Note:</strong> To send emails from a custom domain (e.g. <code>support@yourcustomdomain.com</code>) through Gmail SMTP without exposing your personal Gmail, configure the domain under Gmail Settings &gt; <em>Accounts and Import</em> &gt; <em>"Send mail as"</em>.
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button type="button" variant="ghost" onClick={() => setShowAddAccountModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingAccount}>
              {isSubmittingAccount ? 'Validating Connection...' : 'Validate & Save Account'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT ACCOUNT CREDENTIALS MODAL */}
      <Modal
        isOpen={Boolean(editAccount)}
        onClose={() => setEditAccount(null)}
        title={`Edit Credentials — ${editAccount?.accountName}`}
      >
        <form onSubmit={handleEditAccount} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Update credentials for this provider account ({editAccount?.providerType === 'smtp' ? 'SMTP Relay' : 'Brevo REST API'}).
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Account Name
            </label>
            <Input
              value={editAccountName}
              onChange={(e) => setEditAccountName(e.target.value)}
              placeholder="e.g. Primary Account"
            />
          </div>

          {editProviderType === 'smtp' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    SMTP Host
                  </label>
                  <Input
                    value={editSmtpHost}
                    onChange={(e) => setEditSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Port
                  </label>
                  <Input
                    type="number"
                    value={editSmtpPort}
                    onChange={(e) => setEditSmtpPort(parseInt(e.target.value, 10) || 465)}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  SMTP Username / Email
                </label>
                <Input
                  type="email"
                  value={editSmtpUser}
                  onChange={(e) => setEditSmtpUser(e.target.value)}
                  placeholder="your-account@gmail.com"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  New SMTP Password / App Password
                </label>
                <Input
                  type="password"
                  value={editSmtpPass}
                  onChange={(e) => setEditSmtpPass(e.target.value)}
                  placeholder="Enter new 16-character App Password"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Daily Quota Limit
                </label>
                <Input
                  type="number"
                  value={editSmtpDailyLimit}
                  onChange={(e) => setEditSmtpDailyLimit(parseInt(e.target.value, 10) || 500)}
                />
              </div>
            </>
          ) : (
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                New Brevo API Key (v3)
              </label>
              <Input
                type="password"
                value={editApiKey}
                onChange={(e) => setEditApiKey(e.target.value)}
                placeholder="xkeysib-..."
                required
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Current: <code>{editAccount?.maskedApiKey}</code>. Enter new key to replace.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button type="button" variant="ghost" onClick={() => setEditAccount(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingEdit}>
              {isSubmittingEdit ? 'Validating Connection...' : 'Update & Revalidate'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EMERGENCY SHUTDOWN CONFIRMATION MODAL */}
      <Modal
        isOpen={showEmergencyShutdownModal}
        onClose={() => setShowEmergencyShutdownModal(false)}
        title="Trigger Emergency Platform Shutdown"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--danger)',
              color: 'var(--danger-text)',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
          >
            <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--danger)' }} />
            <div>
              <strong>High-Priority Privileged Action:</strong>
              <div style={{ marginTop: '4px' }}>
                This will immediately freeze all transactional outbound email dispatching across every project on the cluster.
                In-flight and incoming messages will remain queued in PostgreSQL without loss.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <Button variant="ghost" onClick={() => setShowEmergencyShutdownModal(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={isSavingPolicy}
              onClick={async () => {
                await handleSavePolicy({ emergencyShutdown: true });
                setShowEmergencyShutdownModal(false);
              }}
            >
              {isSavingPolicy ? 'Shutting down...' : 'Confirm Emergency Shutdown'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 1-CLICK CLOUDFLARE DNS AUTO-SYNC MODAL */}
      <Modal
        isOpen={showCloudflareModal}
        onClose={() => {
          if (!isSyncingCloudflare) {
            setShowCloudflareModal(false);
          }
        }}
        title="1-Click Cloudflare DNS Auto-Sync"
      >
        <form onSubmit={handleCloudflareSync} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-default)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={14} color="#f59e0b" />
              <span>What this automated sync does:</span>
            </div>
            <div>• Connects to Cloudflare zone for <strong>{selectedDomainForCloudflare?.domainName}</strong>.</div>
            <div>• Injects <strong>Brevo verification code</strong> TXT record.</div>
            <div>• Configures <strong>DKIM 1 &amp; DKIM 2</strong> CNAMEs with <em>Proxy OFF (DNS only)</em> to prevent Cloudflare edge blocking.</div>
            <div>• Cleans up duplicate SPF records to comply with RFC 7208.</div>
            <div>• Immediately triggers Brevo cryptographic domain verification.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Cloudflare API Token
            </label>
            <Input
              type="password"
              placeholder="e.g. 7abcD1234_xyz... (Cloudflare API Token)"
              value={cloudflareToken}
              onChange={(e) => setCloudflareToken(e.target.value)}
              required
            />
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              Requires <strong>Zone.DNS:Edit</strong> token permissions.
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
              disabled={isSyncingCloudflare}
            >
              <Zap size={13} style={{ marginRight: '4px' }} />
              {isSyncingCloudflare ? 'Syncing with Cloudflare...' : 'Sync & Authenticate DNS'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Test Email Dispatch Modal */}
      <Modal
        isOpen={!!testSendAccount}
        onClose={() => setTestSendAccount(null)}
        title={`Send Live Test Email (${testSendAccount?.accountName || ''})`}
      >
        <form onSubmit={handleSendLiveTest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Dispatch a live test email through <strong>{testSendAccount?.providerType?.toUpperCase()}</strong> to verify connection and observe real-time quota cap decrement.
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Recipient Email Address
            </label>
            <Input
              type="email"
              placeholder="e.g. user@example.com"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Subject
            </label>
            <Input
              type="text"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Message
            </label>
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSendingLiveTest}
              onClick={() => setTestSendAccount(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSendingLiveTest}
            >
              <Send size={13} style={{ marginRight: '6px' }} />
              {isSendingLiveTest ? 'Transmitting...' : 'Dispatch Live Test'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
