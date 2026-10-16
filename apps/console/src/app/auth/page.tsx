'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Search,
  ShieldCheck,
  Key,
  Trash2,
  Lock,
  CheckCircle2,
  XCircle,
  Ban,
  RefreshCw,
  Clock,
  Mail,
  ShieldAlert,
  Globe,
  Sliders,
  FileText,
  Code,
  Link as LinkIcon,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Edit2,
  Send,
  Eye,
  EyeOff,
  Settings as SettingsIcon,
  Check,
  AlertTriangle,
  Info,
  Server,
  User,
  ExternalLink,
  Shield,
  Copy,
  Plus,
  UserCheck,
  Fingerprint,
  Smartphone,
  KeyRound,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useProject } from '@/components/ProjectContext';
import { API_BASE_URL } from '@/config';
import {
  ProjectAuthConfig,
  EmailTemplateConfig,
  EmailTemplateType,
  AuthUsageTelemetry,
  AuthActivityLog,
  AuthProviderId,
} from '@syntrabase/shared-types';

export default function SyntrabaseAuthPage() {
  const { addToast } = useToast();
  const { activeProject, isSuspended } = useProject();
  const projectId = activeProject.id;

  // Main Tabs
  const [activeTab, setActiveTab] = useState<'users' | 'sign-in-method' | 'templates' | 'usage' | 'settings'>('users');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['users', 'sign-in-method', 'templates', 'usage', 'settings'].includes(tabParam)) {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  // ---------------------------------------------------------------------------
  // TAB 1: USERS STATE
  // ---------------------------------------------------------------------------
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmailVerified, setNewEmailVerified] = useState(false);
  const [deletingUser, setDeletingUser] = useState<any | null>(null);

  // Custom Claims modal
  const [showClaimsModal, setShowClaimsModal] = useState(false);
  const [claimsJson, setClaimsJson] = useState('{\n  "role": "admin",\n  "tier": "pro"\n}');

  // Reset Password Modal
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPasswordTargetUser, setResetPasswordTargetUser] = useState<any | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [showResetPasswordText, setShowResetPasswordText] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);

  // ---------------------------------------------------------------------------
  // TAB 2: SIGN-IN METHOD STATE
  // ---------------------------------------------------------------------------
  const [config, setConfig] = useState<ProjectAuthConfig | null>(null);
  const [editingProvider, setEditingProvider] = useState<AuthProviderId | null>(null);
  const [providerEnabled, setProviderEnabled] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [redirectUriInput, setRedirectUriInput] = useState('');

  // ---------------------------------------------------------------------------
  // TAB 3: TEMPLATES STATE
  // ---------------------------------------------------------------------------
  const [activeTemplateType, setActiveTemplateType] = useState<
    'verify_email' | 'password_reset' | 'email_change' | 'mfa_enrollment'
  >('verify_email');
  const [templateSenderName, setTemplateSenderName] = useState('Syntrabase App');
  const [templateFromEmail, setTemplateFromEmail] = useState('');
  const [templateReplyTo, setTemplateReplyTo] = useState('');
  const [templateSubject, setTemplateSubject] = useState('Verify your email for %APP_NAME%');
  const [templateBody, setTemplateBody] = useState(
    'Hello %DISPLAY_NAME%,\n\nFollow this link to verify your email address.\n\n%LINK%\n\nIf you did not ask to verify this address, you can ignore this email.\n\nThanks,\nYour %APP_NAME% team'
  );
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [authorizedSenders, setAuthorizedSenders] = useState<any[]>([]);
  const [isLoadingSenders, setIsLoadingSenders] = useState(false);
  const [projectTemplates, setProjectTemplates] = useState<Record<string, EmailTemplateConfig>>({});

  // ---------------------------------------------------------------------------
  // TAB 4: USAGE STATE
  // ---------------------------------------------------------------------------
  const [usageTelemetry, setUsageTelemetry] = useState<AuthUsageTelemetry>({
    totalUsers: 0,
    activeUsers: 0,
    anonymousUsers: 0,
    verifiedUsers: 0,
    disabledUsers: 0,
    successfulSignIns: 0,
    failedSignIns: 0,
    totalSignups: 0,
    passwordResetsSent: 0,
    verificationsSent: 0,
    rateLimitRejections: 0,
    providerBreakdown: { email_password: 0, anonymous: 0 },
  });
  const [activityLogs, setActivityLogs] = useState<AuthActivityLog[]>([]);

  // ---------------------------------------------------------------------------
  // TAB 5: SETTINGS SUB-NAVIGATION STATE
  // ---------------------------------------------------------------------------
  const [activeSettingSection, setActiveSettingSection] = useState<'user_actions' | 'verification' | 'linking' | 'password' | 'quota' | 'domains' | 'mfa'>('user_actions');
  const [requireEmailVerification, setRequireEmailVerification] = useState(false);
  const [accountLinkingMode, setAccountLinkingMode] = useState<'link_same_email' | 'multiple_accounts'>('link_same_email');

  // User Actions Configuration (Public Sign-up, Public Delete, Enumeration Protection)
  const [enableCreate, setEnableCreate] = useState(true);
  const [enableDelete, setEnableDelete] = useState(true);
  const [emailEnumerationProtection, setEmailEnumerationProtection] = useState(true);

  // Multi-Factor Authentication Configuration (Optional, Required All, Required Selected)
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaEnforcement, setMfaEnforcement] = useState<'optional' | 'required_all' | 'required_selected'>('optional');
  const [mfaAllowedFactors, setMfaAllowedFactors] = useState<('totp' | 'passkey')[]>(['totp', 'passkey']);
  const [mfaSelectedRoles, setMfaSelectedRoles] = useState('admin');
  const [mfaSelectedClaims, setMfaSelectedClaims] = useState('mfaRequired');

  // Password Policy settings
  const [pwdMinLength, setPwdMinLength] = useState(8);
  const [pwdRequireUppercase, setPwdRequireUppercase] = useState(false);
  const [pwdRequireLowercase, setPwdRequireLowercase] = useState(false);
  const [pwdRequireNumbers, setPwdRequireNumbers] = useState(false);
  const [pwdRequireSymbols, setPwdRequireSymbols] = useState(false);

  // Signup Quota
  const [signupQuotaWindow, setSignupQuotaWindow] = useState(100);

  // Authorized Domains
  const [authorizedDomains, setAuthorizedDomains] = useState(['localhost', '127.0.0.1', 'syntrabase.internal']);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [showAddDomainModal, setShowAddDomainModal] = useState(false);

  // Helper to attach developer Bearer token from localStorage
  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Fetch Authorized Senders for project
  const fetchAuthorizedSenders = useCallback(async () => {
    setIsLoadingSenders(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/email/senders`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const senders = data.senders || [];
        setAuthorizedSenders(senders);
        // Default template sender if none selected
        if (senders.length > 0 && !templateFromEmail) {
          const primary = senders.find((s: any) => s.status === 'active') || senders[0];
          setTemplateFromEmail(primary.emailAddress);
          setTemplateSenderName(primary.displayName || 'Syntrabase App');
          setTemplateReplyTo(primary.emailAddress);
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingSenders(false);
    }
  }, [projectId, templateFromEmail, getAuthHeaders]);

  // Load project configuration & users on mount or project switch
  const fetchAuthConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/config`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        if (data.config) {
          setRequireEmailVerification(Boolean(data.config.requireEmailVerification));
          if (data.config.emailTemplates) {
            setProjectTemplates(data.config.emailTemplates);
            const initialTmpl = data.config.emailTemplates.verify_email;
            if (initialTmpl) {
              setTemplateSenderName(initialTmpl.senderName || 'Syntrabase App');
              setTemplateFromEmail(initialTmpl.fromEmail || '');
              setTemplateReplyTo(initialTmpl.replyTo || '');
              setTemplateSubject(initialTmpl.subject || 'Verify your email for %APP_NAME%');
              setTemplateBody(initialTmpl.body || '');
            }
          }
          setAccountLinkingMode(data.config.accountLinkingMode || 'link_same_email');
          if (data.config.passwordPolicy) {
            setPwdMinLength(data.config.passwordPolicy.minLength || 8);
            setPwdRequireUppercase(data.config.passwordPolicy.requireUppercase || false);
            setPwdRequireLowercase(data.config.passwordPolicy.requireLowercase || false);
            setPwdRequireNumbers(data.config.passwordPolicy.requireNumbers || false);
            setPwdRequireSymbols(data.config.passwordPolicy.requireSymbols || false);
          }
          if (data.config.authorizedDomains) {
            setAuthorizedDomains(data.config.authorizedDomains);
          }
          if (data.config.signupQuotaPerWindow) {
            setSignupQuotaWindow(data.config.signupQuotaPerWindow);
          }
          if (data.config.userActions) {
            setEnableCreate(data.config.userActions.enableCreate !== false);
            setEnableDelete(data.config.userActions.enableDelete !== false);
            setEmailEnumerationProtection(data.config.userActions.emailEnumerationProtection !== false);
          }
          if (data.config.mfaPolicy) {
            setMfaEnabled(Boolean(data.config.mfaPolicy.enabled));
            setMfaEnforcement(data.config.mfaPolicy.enforcement || (data.config.mfaPolicy.enforceForAdmins ? 'required_selected' : 'optional'));
            setMfaAllowedFactors(data.config.mfaPolicy.allowedFactors || ['totp', 'passkey']);
            if (data.config.mfaPolicy.selectedCriteria) {
              setMfaSelectedRoles(data.config.mfaPolicy.selectedCriteria.roles?.join(', ') || 'admin');
              setMfaSelectedClaims(data.config.mfaPolicy.selectedCriteria.customClaims?.join(', ') || 'mfaRequired');
            }
          }
        }
      }
    } catch {
      // Fallback
    }
  }, [projectId, getAuthHeaders]);

  const handleSaveVerificationSetting = async (required: boolean) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ requireEmailVerification: required }),
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        addToast(
          required
            ? 'Email verification is now strictly required before sign-in.'
            : 'Email verification requirement disabled. Users can sign in immediately.',
          'success'
        );
      } else {
        addToast('Failed to update email verification setting', 'error');
      }
    } catch {
      addToast('Network error updating email verification setting', 'error');
    }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const url = userSearch
        ? `${API_BASE_URL}/api/v1/projects/${projectId}/auth/users?search=${encodeURIComponent(userSearch)}`
        : `${API_BASE_URL}/api/v1/projects/${projectId}/auth/users`;
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.users)) {
          setUsers(data.users);
        }
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, [projectId, userSearch, getAuthHeaders]);

  const fetchUsageTelemetry = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/usage`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const telemetry = data.telemetry || data.usage;
        if (telemetry) {
          setUsageTelemetry(telemetry);
        }
      }
    } catch {
      // Fallback
    }
  }, [projectId, getAuthHeaders]);

  const fetchActivityLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/logs?limit=50`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.logs) setActivityLogs(data.logs);
      }
    } catch {
      // Fallback
    }
  }, [projectId, getAuthHeaders]);

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await Promise.all([fetchAuthConfig(), fetchAuthorizedSenders(), fetchUsers(), fetchUsageTelemetry(), fetchActivityLogs()]);
      addToast('Authentication status refreshed', 'info');
    } finally {
      setTimeout(() => setIsManualRefreshing(false), 700);
    }
  };

  useEffect(() => {
    fetchAuthConfig();
    fetchAuthorizedSenders();
    fetchUsers();
    fetchUsageTelemetry();
    fetchActivityLogs();
  }, [fetchAuthConfig, fetchAuthorizedSenders, fetchUsers, fetchUsageTelemetry, fetchActivityLogs]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          displayName: newDisplayName.trim() || undefined,
          emailVerified: newEmailVerified,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to create user');
      }

      addToast('User created successfully', 'success');
      setShowAddUserModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewEmailVerified(false);
      await fetchUsers();
      await fetchUsageTelemetry();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const openProviderModal = (provider: AuthProviderId) => {
    setEditingProvider(provider);
    let isEnabled = false;
    if (config) {
      switch (provider) {
        case 'email_password':
          isEnabled = config.emailPasswordEnabled;
          break;
        case 'anonymous':
          isEnabled = config.anonymousEnabled;
          break;
        case 'google':
          isEnabled = config.googleOauthEnabled;
          break;
        case 'github':
          isEnabled = config.githubOauthEnabled;
          break;
        case 'apple':
          isEnabled = config.appleOauthEnabled;
          break;
      }
    } else {
      isEnabled = provider === 'email_password' || provider === 'anonymous';
    }
    setProviderEnabled(isEnabled);

    const pConfig = config?.providersConfig?.[provider] || {};
    setClientIdInput((pConfig.clientId as string) || '');
    setClientSecretInput('');
    setRedirectUriInput(
      (pConfig.redirectUri as string) || `https://api.syntrabase.internal/api/v1/auth/callback/${provider}`
    );
  };

  const handleSaveProvider = async () => {
    if (!editingProvider) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/config/providers/${editingProvider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          provider: editingProvider,
          enabled: providerEnabled,
          clientId: clientIdInput || undefined,
          clientSecret: clientSecretInput || undefined,
          redirectUri: redirectUriInput || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        addToast(`Provider '${editingProvider}' updated successfully`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Failed to update provider', 'error');
      }
      setEditingProvider(null);
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          userActions: {
            enableCreate,
            enableDelete,
            emailEnumerationProtection,
          },
          accountLinkingMode,
          passwordPolicy: {
            minLength: pwdMinLength,
            requireUppercase: pwdRequireUppercase,
            requireLowercase: pwdRequireLowercase,
            requireNumbers: pwdRequireNumbers,
            requireSymbols: pwdRequireSymbols,
          },
          signupQuotaPerWindow: signupQuotaWindow,
          authorizedDomains,
          mfaPolicy: {
            enabled: mfaEnabled,
            enforcement: mfaEnforcement,
            enforceForAdmins: mfaEnforcement === 'required_selected',
            allowedFactors: mfaAllowedFactors,
            selectedCriteria: {
              roles: mfaSelectedRoles.split(',').map((r) => r.trim()).filter(Boolean),
              customClaims: mfaSelectedClaims.split(',').map((c) => c.trim()).filter(Boolean),
            },
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        addToast('Authentication settings saved successfully', 'success');
      } else {
        addToast('Failed to save settings', 'error');
      }
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const handleToggleUserStatus = async (user: any) => {
    const newStatus = !user.disabled;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ disabled: newStatus }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === user.id ? { ...u, disabled: newStatus } : u)));
        if (selectedUser?.id === user.id) {
          setSelectedUser({ ...selectedUser, disabled: newStatus });
        }
        addToast(newStatus ? 'User disabled' : 'User enabled', 'info');
      }
    } catch {
      addToast('Failed to change user status', 'error');
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== deletingUser.id));
        if (selectedUser?.id === deletingUser.id) setSelectedUser(null);
        addToast('User deleted successfully', 'success');
      } else {
        addToast('Failed to delete user', 'error');
      }
    } catch {
      addToast('Network error deleting user', 'error');
    } finally {
      setDeletingUser(null);
    }
  };

  const handleSaveCustomClaims = async () => {
    if (!selectedUser) return;
    try {
      const parsed = JSON.parse(claimsJson);
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/users/${selectedUser.id}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ customClaims: parsed }),
      });
      if (res.ok) {
        addToast('Custom claims updated on JWT payload', 'success');
        setShowClaimsModal(false);
      } else {
        addToast('Failed to update claims', 'error');
      }
    } catch {
      addToast('Invalid JSON syntax for claims', 'error');
    }
  };

  const handleRevokeTokens = async (uid: string) => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/users/${uid}/revoke`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        addToast('All active refresh tokens revoked', 'info');
      }
    } catch {
      addToast('Failed to revoke tokens', 'error');
    }
  };

  const handleSelectTemplate = (type: any) => {
    setActiveTemplateType(type);
    setIsEditingTemplate(false);
    const tmpl = projectTemplates[type] || config?.emailTemplates?.[type as EmailTemplateType];
    if (tmpl) {
      setTemplateSenderName(tmpl.senderName || 'Syntrabase App');
      setTemplateFromEmail(tmpl.fromEmail || '');
      setTemplateReplyTo(tmpl.replyTo || '');
      setTemplateSubject(tmpl.subject || '');
      setTemplateBody(tmpl.body || '');
    } else {
      if (type === 'verify_email') {
        setTemplateSubject('Verify your email for %APP_NAME%');
        setTemplateBody(
          'Hello %DISPLAY_NAME%,\n\nFollow this link to verify your email address.\n\n%LINK%\n\nIf you did not ask to verify this address, you can ignore this email.\n\nThanks,\nYour %APP_NAME% team'
        );
      } else if (type === 'password_reset') {
        setTemplateSubject('Reset your password for %APP_NAME%');
        setTemplateBody(
          'Hello %DISPLAY_NAME%,\n\nFollow this link to reset your %APP_NAME% password.\n\n%LINK%\n\nIf you did not request a password reset, you can safely ignore this email.\n\nThanks,\nYour %APP_NAME% team'
        );
      } else if (type === 'email_change') {
        setTemplateSubject('Notice of email change for %APP_NAME%');
        setTemplateBody(
          'Hello %DISPLAY_NAME%,\n\nYour email address for %APP_NAME% has been changed to %NEW_EMAIL%.\n\nIf you did not make this change, please follow this link to revert:\n%LINK%\n\nThanks,\nYour %APP_NAME% team'
        );
      } else if (type === 'mfa_enrollment') {
        setTemplateSubject('Two-Factor Authentication Enrolled for %APP_NAME%');
        setTemplateBody(
          'Hello %DISPLAY_NAME%,\n\nTwo-factor authentication (TOTP) was successfully enabled on your account.\n\nIf you did not perform this action, revoke your credentials immediately.\n\nThanks,\nYour %APP_NAME% team'
        );
      }
      if (authorizedSenders.length > 0) {
        const primary = authorizedSenders.find((s: any) => s.status === 'active') || authorizedSenders[0];
        setTemplateFromEmail(primary.emailAddress);
        setTemplateSenderName(primary.displayName || 'Syntrabase App');
        setTemplateReplyTo(primary.emailAddress);
      }
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateFromEmail) {
      addToast('An authorized sender email address is required', 'error');
      return;
    }
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const payload = {
        senderName: templateSenderName,
        fromEmail: templateFromEmail,
        replyTo: templateReplyTo || templateFromEmail,
        subject: templateSubject,
        body: templateBody,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/templates/${activeTemplateType}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        addToast('Template updated successfully', 'success');
        setIsEditingTemplate(false);
        setProjectTemplates((prev) => ({
          ...prev,
          [activeTemplateType]: payload as any,
        }));
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || 'Failed to save template', 'error');
      }
    } catch {
      addToast('Error saving template', 'error');
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/templates/${activeTemplateType}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          testEmail: testEmailAddress.trim(),
        }),
      });

      if (res.ok) {
        addToast(`Test email queued to ${testEmailAddress}`, 'success');
        setShowTestEmailModal(false);
        setTestEmailAddress('');
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.message || err.error || 'Email gateway unconfigured. Set up an authorized sender in Project Email or Super Admin.', 'warning');
      }
    } catch {
      addToast('Error dispatching test email', 'error');
    }
  };

  const handleDirectResetPassword = async () => {
    if (!resetPasswordTargetUser) return;
    if (!newResetPassword || newResetPassword.length < 6) {
      addToast('Password must be at least 6 characters long', 'error');
      return;
    }
    setIsResettingPassword(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/users/${resetPasswordTargetUser.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: newResetPassword }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update user password');
      }
      addToast(`Password successfully updated for ${resetPasswordTargetUser.email || resetPasswordTargetUser.id}`, 'success');
      setShowResetPasswordModal(false);
      setNewResetPassword('');
      setResetPasswordTargetUser(null);
    } catch (err: any) {
      addToast(err.message || 'Error updating password', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleSendPasswordResetEmail = async () => {
    if (!resetPasswordTargetUser || !resetPasswordTargetUser.email) {
      addToast('User has no email address configured to send reset instructions', 'error');
      return;
    }
    setIsSendingResetEmail(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: resetPasswordTargetUser.email }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to dispatch password reset email');
      }
      addToast(`Password reset link sent to ${resetPasswordTargetUser.email}`, 'success');
      setShowResetPasswordModal(false);
      setResetPasswordTargetUser(null);
    } catch (err: any) {
      addToast(err.message || 'Error sending password reset email', 'error');
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleAddDomain = () => {
    const dom = newDomainInput.trim().toLowerCase();
    if (!dom) return;
    if (authorizedDomains.includes(dom)) {
      addToast('Domain already in authorized list', 'warning');
      return;
    }
    const updated = [...authorizedDomains, dom];
    setAuthorizedDomains(updated);
    setNewDomainInput('');
    setShowAddDomainModal(false);
    addToast(`Added ${dom} to authorized domains`, 'success');
  };

  const handleRemoveDomain = (dom: string) => {
    setAuthorizedDomains(authorizedDomains.filter((d) => d !== dom));
    addToast(`Removed ${dom}`, 'info');
  };

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return (
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.id && u.id.toLowerCase().includes(term)) ||
      (u.displayName && u.displayName.toLowerCase().includes(term))
    );
  });

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {isSuspended && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock size={18} />
            <span>
              AUTHENTICATION LOCKDOWN: Project &ldquo;{activeProject.name}&rdquo; is suspended. All user sign-ups, sign-ins, token issuance, and password resets are locked down.
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', background: 'var(--danger)', color: '#fff' }}>
            LOCKED OUT
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. TOP HEADER & NAVIGATION TABS                                            */}
      {/* ========================================================================= */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              Authentication Engine &gt; {activeProject.name}
            </div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
              Authentication
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--primary-subtle)',
                color: 'var(--primary-text)',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              <ShieldCheck size={14} />
              <span>Argon2id + JWT Engine</span>
            </span>
          </div>
        </div>

        {/* Real-time Authentication & Telemetry Overview Cards */}
        <div
          id="auth-telemetry-overview-cards"
          data-testid="auth-telemetry-overview-cards"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          {[
            {
              id: 'telemetry-total-users',
              label: 'Total Users',
              value: usageTelemetry.totalUsers || users.length,
              icon: Users,
              color: 'var(--primary, #6366f1)',
              bg: 'rgba(99, 102, 241, 0.1)',
            },
            {
              id: 'telemetry-active-users',
              label: 'Active Users',
              value: usageTelemetry.activeUsers || users.filter((u) => !u.disabled).length,
              icon: CheckCircle2,
              color: 'var(--success, #10b981)',
              bg: 'rgba(16, 185, 129, 0.1)',
            },
            {
              id: 'telemetry-anonymous-users',
              label: 'Anonymous Users',
              value: usageTelemetry.anonymousUsers || users.filter((u) => u.isAnonymous || (!u.email && !u.phoneNumber)).length,
              icon: User,
              color: 'var(--text-muted, #94a3b8)',
              bg: 'var(--bg-surface-subtle, rgba(255, 255, 255, 0.05))',
            },
            {
              id: 'telemetry-successful-signins',
              label: 'Successful Sign-Ins',
              value: usageTelemetry.successfulSignIns,
              icon: ShieldCheck,
              color: '#3b82f6',
              bg: 'rgba(59, 130, 246, 0.1)',
            },
            {
              id: 'telemetry-failed-signins',
              label: 'Sign-In Failures',
              value: usageTelemetry.failedSignIns,
              icon: ShieldAlert,
              color: 'var(--danger, #ef4444)',
              bg: 'rgba(239, 68, 68, 0.1)',
            },
          ].map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                id={m.id}
                data-testid={m.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div
                  style={{
                    padding: '10px',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: m.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} color={m.color} />
                </div>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontSize: '1.4rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      lineHeight: 1.2,
                      marginTop: '2px',
                    }}
                  >
                    {m.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Top Tab Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: '0px',
          }}
        >
          {[
            { id: 'users', label: 'Users' },
            { id: 'sign-in-method', label: 'Sign-in method' },
            { id: 'templates', label: 'Templates' },
            { id: 'usage', label: 'Usage & Telemetry' },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`auth-tab-${tab.id}`}
                data-testid={`auth-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  padding: '10px 18px',
                  fontSize: '0.86rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: USERS                                                              */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Action Row: Search input + Add User button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '360px', maxWidth: '100%' }}>
              <Search
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                id="syntrabase-auth-user-search-input"
                name="auth-user-search-query"
                type="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-lpignore="true"
                data-form-type="other"
                placeholder="Search by email, UID, or name..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 12px 8px 36px',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                <span>Add user</span>
              </button>

              <button
                onClick={handleManualRefresh}
                className="btn btn-secondary"
                style={{ padding: '8px', borderRadius: 'var(--radius-md)' }}
                title="Refresh user directory"
                disabled={loading || isManualRefreshing}
              >
                <RefreshCw size={15} className={(loading || isManualRefreshing) ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <th style={{ padding: '12px 18px', width: '25%' }}>Identifier</th>
                  <th style={{ padding: '12px 18px', width: '13%' }}>Provider</th>
                  <th style={{ padding: '12px 18px', width: '16%' }}>Created</th>
                  <th style={{ padding: '12px 18px', width: '16%' }}>Last Sign In</th>
                  <th style={{ padding: '12px 18px', width: '18%' }}>User UID</th>
                  <th style={{ padding: '12px 18px', width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                        <Users size={32} color="var(--text-muted)" />
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>No users in this project yet</div>
                        <div style={{ fontSize: '0.8rem', maxWidth: '420px', lineHeight: 1.5 }}>
                          Add a user manually or integrate the <code>@syntrabase/client-sdk</code> to allow users to register with Email/Password or Anonymous sign-in.
                        </div>
                        <button
                          onClick={() => setShowAddUserModal(true)}
                          className="btn btn-primary"
                          style={{ marginTop: '8px', fontSize: '0.8rem' }}
                        >
                          <Plus size={14} /> Add First User
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isAnon = u.isAnonymous || (!u.email && !u.phoneNumber);
                    const identifier = isAnon ? '(anonymous)' : u.email;

                    return (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                          transition: 'background-color 0.15s ease',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => setSelectedUser(u)}
                      >
                        <td style={{ padding: '14px 18px', color: isAnon ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: isAnon ? 'inherit' : 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 500 }}>
                              {identifier}
                            </span>
                            {u.disabled && (
                              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--danger-subtle)', color: 'var(--danger-text)', fontWeight: 600 }}>
                                Disabled
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isAnon ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                <User size={14} /> Anonymous
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', color: 'var(--primary-text)' }}>
                                <Mail size={14} /> Password
                              </span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {formatDate(u.createdAt)}
                        </td>

                        <td style={{ padding: '14px 18px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                          {formatDate(u.lastSignInAt || u.createdAt)}
                        </td>

                        <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span>{u.id.length > 18 ? `${u.id.substring(0, 18)}...` : u.id}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(u.id);
                                addToast('Copied user UID to clipboard', 'info');
                              }}
                              className="btn btn-ghost"
                              style={{ padding: '4px', height: '24px', width: '24px' }}
                              title="Copy UID"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setResetPasswordTargetUser(u);
                                setNewResetPassword('');
                                setShowResetPasswordText(false);
                                setShowResetPasswordModal(true);
                              }}
                              className="btn btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="Reset user password"
                            >
                              <Key size={12} color="var(--primary)" />
                              <span>Reset</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SIGN-IN METHOD                                                     */}
      {/* ========================================================================= */}
      {activeTab === 'sign-in-method' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Active Providers Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Standard Providers</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Production authentication providers backed by the Syntrabase cryptographic engine.
                </div>
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 18px', width: '50%' }}>Provider</th>
                    <th style={{ padding: '12px 18px', width: '35%' }}>Status</th>
                    <th style={{ padding: '12px 18px', width: '15%', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      id: 'email_password' as AuthProviderId,
                      name: 'Email/Password',
                      desc: 'Argon2id password hashing with customizable password policies and action tokens',
                      icon: <Mail size={16} color="var(--primary)" />,
                      enabled: config ? config.emailPasswordEnabled : true,
                    },
                    {
                      id: 'anonymous' as AuthProviderId,
                      name: 'Anonymous',
                      desc: 'Ephemeral guest identities with account linking upgrade paths',
                      icon: <User size={16} color="var(--text-secondary)" />,
                      enabled: config ? config.anonymousEnabled : true,
                    },
                  ].map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)' }}>
                            {p.icon}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            background: p.enabled ? 'var(--success-subtle)' : 'var(--bg-surface-subtle)',
                            color: p.enabled ? 'var(--success-text)' : 'var(--text-muted)',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: p.enabled ? 'var(--success)' : 'var(--text-muted)',
                            }}
                          />
                          {p.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <button
                          onClick={() => openProviderModal(p.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* OAuth Providers Section (Clear Preview Status) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>OAuth 2.0 Providers (Preview)</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Store OAuth credentials (AES-256-GCM encrypted). Server-side callback exchange endpoints can be configured per environment.
              </div>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontSize: '0.74rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 18px', width: '50%' }}>Provider</th>
                    <th style={{ padding: '12px 18px', width: '35%' }}>Status</th>
                    <th style={{ padding: '12px 18px', width: '15%', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      id: 'google' as AuthProviderId,
                      name: 'Google',
                      desc: 'Google Sign-In with OAuth 2.0 and OpenID Connect',
                      icon: <Globe size={16} color="var(--primary)" />,
                      enabled: config ? config.googleOauthEnabled : false,
                    },
                    {
                      id: 'github' as AuthProviderId,
                      name: 'GitHub',
                      desc: 'GitHub developer authorization with repo/read scopes',
                      icon: <Code size={16} color="var(--text-primary)" />,
                      enabled: config ? config.githubOauthEnabled : false,
                    },
                    {
                      id: 'apple' as AuthProviderId,
                      name: 'Apple',
                      desc: 'Sign in with Apple private relay and service identifiers',
                      icon: <Shield size={16} color="var(--text-secondary)" />,
                      enabled: config ? config.appleOauthEnabled : false,
                    },
                  ].map((p) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-subtle)' }}>
                            {p.icon}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 18px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            background: p.enabled ? 'var(--warning-subtle)' : 'var(--bg-surface-subtle)',
                            color: p.enabled ? 'var(--warning-text)' : 'var(--text-muted)',
                          }}
                        >
                          {p.enabled ? 'Configured (Preview)' : 'Not Configured'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                        <button
                          onClick={() => openProviderModal(p.id)}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.76rem' }}
                        >
                          Configure
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TEMPLATES                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>
          {/* Sidebar */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignSelf: 'start',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 10px' }}>
              Email Templates
            </div>
            {[
              { id: 'verify_email', label: 'Email address verification', icon: Mail },
              { id: 'password_reset', label: 'Password reset', icon: Lock },
              { id: 'email_change', label: 'Email address change notice', icon: RefreshCw },
              { id: 'mfa_enrollment', label: '2FA enrollment notice', icon: ShieldCheck },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = activeTemplateType === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => handleSelectTemplate(t.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    fontWeight: isSelected ? 600 : 500,
                    background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                    color: isSelected ? 'var(--primary-text)' : 'var(--text-secondary)',
                  }}
                >
                  <Icon size={15} />
                  <span>{t.label}</span>
                </div>
              );
            })}
          </div>

          {/* Template Editor */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {activeTemplateType.replace(/_/g, ' ').toUpperCase()} Template
                </h3>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Variables: <code>%APP_NAME%</code>, <code>%DISPLAY_NAME%</code>, <code>%LINK%</code>, <code>%EMAIL%</code>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowTestEmailModal(true)} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>
                  <Send size={13} /> Send Test Email
                </button>
                {isEditingTemplate ? (
                  <button onClick={handleSaveTemplate} className="btn btn-primary" style={{ fontSize: '0.78rem' }}>
                    Save Template
                  </button>
                ) : (
                  <button onClick={() => setIsEditingTemplate(true)} className="btn btn-secondary" style={{ fontSize: '0.78rem' }}>
                    <Edit2 size={13} /> Edit
                  </button>
                )}
              </div>
            </div>

            {authorizedSenders.length === 0 && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} color="#eab308" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                    <strong>No authorized sender identity configured for this project.</strong>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Transactional emails cannot be sent until a custom domain is verified and an authorized sender identity is created.
                    </div>
                  </div>
                </div>
                <a
                  href="/email"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.76rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                  <ExternalLink size={12} /> Configure Domain &amp; Sender
                </a>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Sender Name
                </label>
                <input
                  type="text"
                  value={templateSenderName}
                  disabled={!isEditingTemplate}
                  onChange={(e) => setTemplateSenderName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: isEditingTemplate ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Authorized Sender Address
                </label>
                {authorizedSenders.length > 0 ? (
                  <select
                    value={templateFromEmail}
                    disabled={!isEditingTemplate}
                    onChange={(e) => {
                      const sel = authorizedSenders.find((s) => s.emailAddress === e.target.value);
                      if (sel) {
                        setTemplateFromEmail(sel.emailAddress);
                        setTemplateSenderName(sel.displayName || templateSenderName);
                        setTemplateReplyTo(sel.emailAddress);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: isEditingTemplate ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem',
                      cursor: isEditingTemplate ? 'pointer' : 'default',
                    }}
                  >
                    {!templateFromEmail && <option value="">-- Select an authorized sender --</option>}
                    {authorizedSenders.map((s) => (
                      <option key={s.id} value={s.emailAddress} disabled={s.status !== 'active'}>
                        {s.displayName} &lt;{s.emailAddress}&gt; {s.status === 'active' ? '✓ (Ready)' : '⚠️ (Unverified)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-subtle)',
                      color: 'var(--text-muted)',
                      fontSize: '0.84rem',
                    }}
                  >
                    No sender ready (configure in /email)
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Subject
              </label>
              <input
                type="text"
                value={templateSubject}
                disabled={!isEditingTemplate}
                onChange={(e) => setTemplateSubject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: isEditingTemplate ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Message Body
              </label>
              <textarea
                rows={7}
                value={templateBody}
                disabled={!isEditingTemplate}
                onChange={(e) => setTemplateBody(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: isEditingTemplate ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.5,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: USAGE & TELEMETRY                                                  */}
      {/* ========================================================================= */}
      {activeTab === 'usage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Total Users', value: usageTelemetry.totalUsers || users.length, icon: Users, color: 'var(--primary)' },
              { label: 'Active Users', value: usageTelemetry.activeUsers || users.filter((u) => !u.disabled).length, icon: CheckCircle2, color: 'var(--success)' },
              { label: 'Anonymous Users', value: usageTelemetry.anonymousUsers || users.filter((u) => u.isAnonymous || (!u.email && !u.phoneNumber)).length, icon: User, color: 'var(--text-muted)' },
              { label: 'Successful Sign-Ins', value: usageTelemetry.successfulSignIns, icon: ShieldCheck, color: 'var(--primary)' },
              { label: 'Sign-In Failures', value: usageTelemetry.failedSignIns, icon: ShieldAlert, color: 'var(--danger)' },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <div
                  key={m.label}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                  }}
                >
                  <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)' }}>
                    <Icon size={20} color={m.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {m.value}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity Logs Table */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-surface-subtle)' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>Auth Audit Trail</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 18px' }}>Timestamp</th>
                  <th style={{ padding: '10px 18px' }}>Event</th>
                  <th style={{ padding: '10px 18px' }}>Actor</th>
                  <th style={{ padding: '10px 18px' }}>IP / Status</th>
                </tr>
              </thead>
              <tbody>
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No authentication events recorded yet.
                    </td>
                  </tr>
                ) : (
                  activityLogs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '10px 18px', color: 'var(--text-muted)', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
                        {new Date(log.createdAt || Date.now()).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: '10px 18px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {log.eventType}
                      </td>
                      <td style={{ padding: '10px 18px', color: 'var(--text-secondary)' }}>
                        {log.actorEmail || log.actorId}
                      </td>
                      <td style={{ padding: '10px 18px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: 'var(--radius-full)', background: 'var(--bg-surface-active)', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 600 }}>
                          {log.ipAddress || 'logged'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SETTINGS                                                           */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: '20px' }}>
          {/* Sub Navigation (Categorized with 28px circular icon badge containers) */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignSelf: 'start',
            }}
          >
            {/* GROUP 1: USER ACCOUNT MANAGEMENT */}
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                padding: '8px 12px 4px',
              }}
            >
              User Account Management
            </div>

            {[
              { id: 'user_actions', label: 'User actions', icon: UserCheck },
              { id: 'verification', label: 'Email verification', icon: Mail },
              { id: 'linking', label: 'Account linking', icon: LinkIcon },
              { id: 'password', label: 'Password policy', icon: Lock },
              { id: 'quota', label: 'Signup rate limits', icon: ShieldAlert },
            ].map((s) => {
              const isSelected = activeSettingSection === s.id;
              const IconComp = s.icon;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSettingSection(s.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    fontWeight: isSelected ? 600 : 500,
                    background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                    color: isSelected ? 'var(--primary-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? 'var(--primary)' : 'var(--bg-surface-active)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    <IconComp size={14} />
                  </div>
                  <span>{s.label}</span>
                </div>
              );
            })}

            {/* GROUP 2: DOMAINS */}
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                padding: '14px 12px 4px',
                borderTop: '1px solid var(--border-subtle)',
                marginTop: '6px',
              }}
            >
              Domains
            </div>

            {[
              { id: 'domains', label: 'Authorized domains', icon: Globe },
            ].map((s) => {
              const isSelected = activeSettingSection === s.id;
              const IconComp = s.icon;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSettingSection(s.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    fontWeight: isSelected ? 600 : 500,
                    background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                    color: isSelected ? 'var(--primary-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? 'var(--primary)' : 'var(--bg-surface-active)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    <IconComp size={14} />
                  </div>
                  <span>{s.label}</span>
                </div>
              );
            })}

            {/* GROUP 3: MULTI-FACTOR AUTHENTICATION */}
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                padding: '14px 12px 4px',
                borderTop: '1px solid var(--border-subtle)',
                marginTop: '6px',
              }}
            >
              Multi-Factor Authentication
            </div>

            {[
              { id: 'mfa', label: 'Multi-factor policy', icon: Key },
            ].map((s) => {
              const isSelected = activeSettingSection === s.id;
              const IconComp = s.icon;
              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSettingSection(s.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    fontWeight: isSelected ? 600 : 500,
                    background: isSelected ? 'var(--primary-subtle)' : 'transparent',
                    color: isSelected ? 'var(--primary-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isSelected ? 'var(--primary)' : 'var(--bg-surface-active)',
                      color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    <IconComp size={14} />
                  </div>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* Settings Section Body */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {activeSettingSection === 'user_actions' && (
              <div>
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                    User Actions Protection
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Control public self-service registration, self-deletion, and account enumeration protection.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Enable Create (sign-up) */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enableCreate}
                        onChange={(e) => setEnableCreate(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      <span>Enable create (sign-up)</span>
                    </label>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginLeft: '28px', marginTop: '6px' }}>
                      Allow public users to self-register via the Client SDK. When disabled, public registrations are blocked with HTTP 403 (<code>SIGNUP_DISABLED</code>). Administrators can still create users via the Admin SDK and Console.
                    </div>
                  </div>

                  {/* Enable Delete */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enableDelete}
                        onChange={(e) => setEnableDelete(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      <span>Enable delete</span>
                    </label>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginLeft: '28px', marginTop: '6px' }}>
                      Allow users to delete their own accounts via the Client SDK. When disabled, self-service deletion is blocked with HTTP 403 (<code>ACCOUNT_DELETION_DISABLED</code>). Administrators can still delete users via the Admin SDK and Console.
                    </div>
                  </div>

                  {/* Email enumeration protection */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={emailEnumerationProtection}
                        onChange={(e) => setEmailEnumerationProtection(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      <span>Email enumeration protection (recommended)</span>
                    </label>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginLeft: '28px', marginTop: '6px' }}>
                      Prevents malicious actors from guessing whether an email is registered. When enabled, failed login attempts return uniform errors, and password reset requests return identical confirmation responses regardless of whether an account exists.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSettingSection === 'verification' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      Authoritative Email Verification
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Enforce email verification before granting normal authenticated sign-in access.
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: requireEmailVerification ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-surface-active)',
                      color: requireEmailVerification ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  >
                    {requireEmailVerification ? 'ENFORCED' : 'OPTIONAL'}
                  </span>
                </div>

                <div
                  style={{
                    padding: '16px 20px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={requireEmailVerification}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setRequireEmailVerification(val);
                        await handleSaveVerificationSetting(val);
                      }}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <span>Require Email Verification before Sign-In</span>
                  </label>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginLeft: '26px' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>When enabled (Enforced):</strong>
                    </div>
                    <ul style={{ margin: '0 0 10px', paddingLeft: '18px' }}>
                      <li>New user signups create accounts in an unverified state.</li>
                      <li>A single-use verification email is enqueued through your project's configured authorized sender.</li>
                      <li>Sign-in is blocked server-side (HTTP 403 <code>EMAIL_NOT_VERIFIED</code>) until verified.</li>
                      <li>Users can request a new verification link via the resend-verification endpoint (60s rate limit).</li>
                    </ul>
                    <div style={{ marginBottom: '4px' }}>
                      <strong>When disabled (Optional):</strong>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px' }}>
                      <li>Users establish normal authenticated sessions immediately upon registration.</li>
                      <li>No automated verification emails are dispatched.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSettingSection === 'linking' && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 0 }}>
                  Account Linking Mode
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Choose how the platform resolves multiple identities with the same email.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="radio"
                      name="linkingMode"
                      checked={accountLinkingMode === 'link_same_email'}
                      onChange={() => setAccountLinkingMode('link_same_email')}
                    />
                    <span>Link accounts that use the same email address (Recommended)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="radio"
                      name="linkingMode"
                      checked={accountLinkingMode === 'multiple_accounts'}
                      onChange={() => setAccountLinkingMode('multiple_accounts')}
                    />
                    <span>Create multiple accounts for each identity provider</span>
                  </label>
                </div>
              </div>
            )}

            {activeSettingSection === 'password' && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 0 }}>
                  Password Security Policy
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Enforced server-side during registration and password resets.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Minimum Password Length
                    </label>
                    <input
                      type="number"
                      min={6}
                      max={64}
                      value={pwdMinLength}
                      onChange={(e) => setPwdMinLength(parseInt(e.target.value, 10) || 8)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-default)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        width: '120px',
                      }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={pwdRequireUppercase}
                      onChange={(e) => setPwdRequireUppercase(e.target.checked)}
                    />
                    <span>Require uppercase letter (A-Z)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={pwdRequireLowercase}
                      onChange={(e) => setPwdRequireLowercase(e.target.checked)}
                    />
                    <span>Require lowercase letter (a-z)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={pwdRequireNumbers}
                      onChange={(e) => setPwdRequireNumbers(e.target.checked)}
                    />
                    <span>Require numerical digit (0-9)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={pwdRequireSymbols}
                      onChange={(e) => setPwdRequireSymbols(e.target.checked)}
                    />
                    <span>Require non-alphanumeric symbol (!@#$%^&*)</span>
                  </label>
                </div>
              </div>
            )}

            {activeSettingSection === 'quota' && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 0 }}>
                  Signup Abuse Mitigation
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Rate limit new account registrations to prevent automated bot signups.
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                    Max signups per 15-minute sliding window
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={signupQuotaWindow}
                    onChange={(e) => setSignupQuotaWindow(parseInt(e.target.value, 10) || 100)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      width: '120px',
                    }}
                  />
                </div>
              </div>
            )}

            {activeSettingSection === 'domains' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      Authorized Domains
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Domains authorized to initiate authentication and receive redirects.
                    </div>
                  </div>
                  <button onClick={() => setShowAddDomainModal(true)} className="btn btn-primary" style={{ fontSize: '0.78rem' }}>
                    <Plus size={13} /> Add Domain
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {authorizedDomains.map((dom) => (
                    <div
                      key={dom}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface-subtle)',
                        border: '1px solid var(--border-default)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.84rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span>{dom}</span>
                      {dom !== 'localhost' && dom !== '127.0.0.1' && (
                        <button
                          onClick={() => handleRemoveDomain(dom)}
                          className="btn btn-ghost"
                          style={{ padding: '4px', color: 'var(--danger)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSettingSection === 'mfa' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      Multi-Factor Authentication (MFA)
                    </h3>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Protect user accounts with a mandatory or optional second authentication factor during login.
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: mfaEnabled ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-surface-active)',
                      color: mfaEnabled ? 'var(--success)' : 'var(--text-muted)',
                    }}
                  >
                    {mfaEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Master Toggle */}
                  <div
                    style={{
                      padding: '16px 20px',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={mfaEnabled}
                        onChange={(e) => setMfaEnabled(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                      />
                      <span>Enable Multi-Factor Authentication for this Project</span>
                    </label>
                  </div>

                  {mfaEnabled && (
                    <>
                      {/* Enforcement Level (3 modes) */}
                      <div
                        style={{
                          padding: '20px',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                          Project Enforcement Level
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          {/* Mode 1: Optional for every user */}
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="mfaEnforcement"
                              checked={mfaEnforcement === 'optional'}
                              onChange={() => setMfaEnforcement('optional')}
                              style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                            />
                            <div>
                              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                1. Optional for every user
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Users can enable MFA themselves from their account security settings. Users who haven't enrolled can still sign in normally with primary credentials.
                              </div>
                            </div>
                          </label>

                          {/* Mode 2: Required for every user */}
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="mfaEnforcement"
                              checked={mfaEnforcement === 'required_all'}
                              onChange={() => setMfaEnforcement('required_all')}
                              style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                            />
                            <div>
                              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                2. Required for every user
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Every user must enroll a second factor before accessing protected application features. The backend strictly enforces this; hiding or skipping setup is rejected server-side.
                              </div>
                            </div>
                          </label>

                          {/* Mode 3: Required for selected users */}
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="mfaEnforcement"
                              checked={mfaEnforcement === 'required_selected'}
                              onChange={() => setMfaEnforcement('required_selected')}
                              style={{ marginTop: '3px', accentColor: 'var(--primary)' }}
                            />
                            <div>
                              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                3. Required for selected users (Role / Claim Gated)
                              </div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                Enforce mandatory MFA only for privileged users (e.g. users with admin roles or high-privilege claims). Standard users can continue signing in normally.
                              </div>
                            </div>
                          </label>
                        </div>

                        {/* Selected criteria inputs */}
                        {mfaEnforcement === 'required_selected' && (
                          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                Required Roles (comma-separated)
                              </label>
                              <input
                                type="text"
                                value={mfaSelectedRoles}
                                onChange={(e) => setMfaSelectedRoles(e.target.value)}
                                placeholder="admin, superadmin, operator"
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-default)',
                                  background: 'var(--bg-surface)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.84rem',
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                Required Custom Claims (comma-separated)
                              </label>
                              <input
                                type="text"
                                value={mfaSelectedClaims}
                                onChange={(e) => setMfaSelectedClaims(e.target.value)}
                                placeholder="mfaRequired, privileged"
                                style={{
                                  width: '100%',
                                  padding: '8px 12px',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-default)',
                                  background: 'var(--bg-surface)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.84rem',
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Allowed Second Factors */}
                      <div
                        style={{
                          padding: '20px',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                          Allowed Second Factors
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.86rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={mfaAllowedFactors.includes('totp')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setMfaAllowedFactors([...mfaAllowedFactors, 'totp']);
                                } else {
                                  setMfaAllowedFactors(mfaAllowedFactors.filter((f) => f !== 'totp'));
                                }
                              }}
                              style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                            />
                            <span><strong>Authenticator App (TOTP)</strong> — Google Authenticator, Microsoft Authenticator, 1Password</span>
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.86rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                            <input
                              type="checkbox"
                              checked={mfaAllowedFactors.includes('passkey')}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setMfaAllowedFactors([...mfaAllowedFactors, 'passkey']);
                                } else {
                                  setMfaAllowedFactors(mfaAllowedFactors.filter((f) => f !== 'passkey'));
                                }
                              }}
                              style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                            />
                            <span><strong>Passkeys (WebAuthn / FIDO2)</strong> — Touch ID, Face ID, Windows Hello, Hardware Keys</span>
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', borderTop: '1px solid var(--border-default)', paddingTop: '16px' }}>
              <button onClick={handleSaveSettings} className="btn btn-primary">
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD USER                                                           */}
      {/* ========================================================================= */}
      {showAddUserModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '440px',
              maxWidth: '90%',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Add User
            </h3>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Email Address <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Password <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={newEmailVerified}
                  onChange={(e) => setNewEmailVerified(e.target.checked)}
                />
                <span>Mark email as verified</span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowAddUserModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIGURE PROVIDER                                                 */}
      {/* ========================================================================= */}
      {editingProvider && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '480px',
              maxWidth: '90%',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Configure {editingProvider.replace(/_/g, ' ').toUpperCase()}
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={providerEnabled}
                  onChange={(e) => setProviderEnabled(e.target.checked)}
                />
                <span style={{ fontWeight: 600 }}>Enable Provider</span>
              </label>
            </div>

            {(editingProvider === 'google' || editingProvider === 'github' || editingProvider === 'apple') && (
              <>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--primary-subtle)',
                    border: '1px solid var(--border-default)',
                    fontSize: '0.78rem',
                    color: 'var(--primary-text)',
                    lineHeight: 1.4,
                  }}
                >
                  OAuth credentials are saved with AES-256-GCM encryption. Configure this callback URI in your provider console:
                  <div style={{ marginTop: '4px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {redirectUriInput}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Client ID
                  </label>
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="e.g. 123456789.apps.googleusercontent.com"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Client Secret
                  </label>
                  <input
                    type="password"
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    placeholder="Leave empty to retain existing stored secret"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      fontSize: '0.84rem',
                    }}
                  />
                </div>
              </>
            )}

            {editingProvider === 'email_password' && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Enables users to sign up and authenticate using an email and password. Configurable password policies and domain validation apply automatically.
              </div>
            )}

            {editingProvider === 'anonymous' && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Allows clients to create temporary guest accounts via <code>signInAnonymously()</code>. Guests can be upgraded to permanent accounts by linking credentials.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setEditingProvider(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleSaveProvider} className="btn btn-primary">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TEST EMAIL                                                         */}
      {/* ========================================================================= */}
      {showTestEmailModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '400px',
              maxWidth: '90%',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Send Test Email
            </h3>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Recipient Address
              </label>
              <input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="dev@example.com"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setShowTestEmailModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleSendTestEmail} className="btn btn-primary">
                Send Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD AUTHORIZED DOMAIN                                              */}
      {/* ========================================================================= */}
      {showAddDomainModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '400px',
              maxWidth: '90%',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Add Authorized Domain
            </h3>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                Domain Name
              </label>
              <input
                type="text"
                value={newDomainInput}
                onChange={(e) => setNewDomainInput(e.target.value)}
                placeholder="e.g. myapp.example.com"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.84rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setShowAddDomainModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleAddDomain} className="btn btn-primary">
                Add Domain
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: USER DETAILS & CUSTOM CLAIMS                                       */}
      {/* ========================================================================= */}
      {selectedUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '520px',
              maxWidth: '90%',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                User Details
              </h3>
              <button onClick={() => setSelectedUser(null)} className="btn btn-ghost" style={{ padding: '4px' }}>
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>UID:</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedUser.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                <span style={{ color: 'var(--text-primary)' }}>{selectedUser.email || '(Anonymous)'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Email Verified:</span>
                <span style={{ color: selectedUser.emailVerified ? 'var(--success)' : 'var(--text-muted)' }}>
                  {selectedUser.emailVerified ? 'Yes' : 'No'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Created:</span>
                <span style={{ color: 'var(--text-primary)' }}>{new Date(selectedUser.createdAt).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setResetPasswordTargetUser(selectedUser);
                  setNewResetPassword('');
                  setShowResetPasswordText(false);
                  setShowResetPasswordModal(true);
                }}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary)', borderColor: 'rgba(37, 99, 235, 0.4)' }}
              >
                <Key size={14} />
                <span>Reset Password</span>
              </button>

              <button
                onClick={() => handleToggleUserStatus(selectedUser)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {selectedUser.disabled ? <CheckCircle2 size={14} color="var(--success)" /> : <Ban size={14} color="var(--danger)" />}
                <span>{selectedUser.disabled ? 'Enable Account' : 'Disable Account'}</span>
              </button>

              <button
                onClick={() => handleRevokeTokens(selectedUser.id)}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} />
                <span>Revoke Tokens</span>
              </button>

              <button
                onClick={() => {
                  setDeletingUser(selectedUser);
                }}
                className="btn btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
              >
                <Trash2 size={14} />
                <span>Delete User</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESET PASSWORD                                                     */}
      {/* ========================================================================= */}
      {showResetPasswordModal && resetPasswordTargetUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDirectResetPassword();
            }}
            autoComplete="off"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '460px',
              maxWidth: '92%',
              padding: '24px',
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
            }}
          >
            {/* Hidden dummy field so browser autofill doesn't reach outside to background search box */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={resetPasswordTargetUser.email || resetPasswordTargetUser.id}
              readOnly
              style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', border: 0 }}
              tabIndex={-1}
              aria-hidden="true"
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ padding: '6px', borderRadius: 'var(--radius-md)', background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
                  <Key size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Reset Password
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    {resetPasswordTargetUser.email || resetPasswordTargetUser.id}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowResetPasswordModal(false);
                  setResetPasswordTargetUser(null);
                  setNewResetPassword('');
                  setShowResetPasswordText(false);
                }}
                className="btn btn-ghost"
                style={{ padding: '4px', height: '28px', width: '28px' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="reset-user-new-password"
                    name="new-password"
                    type={showResetPasswordText ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Enter new password (min. 6 characters)..."
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 38px 9px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--bg-surface-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '0.86rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPasswordText(!showResetPasswordText)}
                    className="btn btn-ghost"
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: '4px',
                      color: 'var(--text-muted)',
                    }}
                    title={showResetPasswordText ? 'Hide password' : 'Show password'}
                  >
                    {showResetPasswordText ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Enter the new password directly to update this user's credentials immediately. Previous sessions will be safely revoked. Alternatively, you can send an action email with a reset link.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
              {resetPasswordTargetUser.email ? (
                <button
                  type="button"
                  onClick={handleSendPasswordResetEmail}
                  disabled={isSendingResetEmail || isResettingPassword}
                  className="btn btn-outline"
                  style={{ fontSize: '0.8rem', padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={13} className={isSendingResetEmail ? 'animate-spin' : ''} />
                  <span>{isSendingResetEmail ? 'Sending...' : 'Send Reset Link Email'}</span>
                </button>
              ) : (
                <div />
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setResetPasswordTargetUser(null);
                    setNewResetPassword('');
                    setShowResetPasswordText(false);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResettingPassword || !newResetPassword}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Key size={14} className={isResettingPassword ? 'animate-spin' : ''} />
                  <span>{isResettingPassword ? 'Saving...' : 'Set New Password'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              width: '400px',
              maxWidth: '90%',
              padding: '24px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--danger)' }}>
              Confirm User Deletion
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to permanently delete user <b>{deletingUser.email || deletingUser.id}</b>? This action immediately revokes authentication tokens and cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button onClick={() => setDeletingUser(null)} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                style={{
                  background: 'var(--danger)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
