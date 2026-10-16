'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  Mail,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Send,
  RefreshCw,
  Server,
  Lock,
  Globe,
  Radio,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface GlobalAuthConfig {
  masterSwitches: {
    emailPassword: boolean;
    anonymous: boolean;
    google: boolean;
    github: boolean;
    apple: boolean;
    phone: boolean;
    mfaTotp: boolean;
  };
  abuseLimits: {
    globalSignupVelocity: number;
    globalBruteForceThreshold: number;
    smsRegionFilter: string;
  };
}

interface EmailProviderAccount {
  id: string;
  accountName: string;
  providerType: string;
  status: string;
  dailySentCount: number;
  dailyQuotaLimit: number;
  isEnabled: boolean;
}

export default function AuthGovernancePage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'master_switches' | 'abuse_limits' | 'email_overview'>('master_switches');

  const [authConfig, setAuthConfig] = useState<GlobalAuthConfig>({
    masterSwitches: {
      emailPassword: true,
      anonymous: true,
      google: true,
      github: true,
      apple: true,
      phone: true,
      mfaTotp: true,
    },
    abuseLimits: {
      globalSignupVelocity: 500,
      globalBruteForceThreshold: 10,
      smsRegionFilter: 'US, CA, GB, EU, AU, JP, SG',
    },
  });

  const [emailAccounts, setEmailAccounts] = useState<EmailProviderAccount[]>([]);
  const [queueDepth, setQueueDepth] = useState<number>(0);
  const [globalEmailSending, setGlobalEmailSending] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  function getAdminToken(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || '';
    }
    return '';
  }

  const fetchConfig = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const token = getAdminToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [authRes, emailAccRes, policyRes, queueRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/admin/auth/global-config`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/email/accounts`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/email/policy`, { headers }),
        fetch(`${API_BASE}/api/v1/admin/email/queue`, { headers }),
      ]);

      if (authRes.ok) {
        const data = await authRes.json();
        setAuthConfig({
          masterSwitches: {
            emailPassword: data.masterSwitches?.emailPassword ?? true,
            anonymous: data.masterSwitches?.anonymous ?? true,
            google: data.masterSwitches?.google ?? true,
            github: data.masterSwitches?.github ?? true,
            apple: data.masterSwitches?.apple ?? true,
            phone: data.masterSwitches?.phone ?? true,
            mfaTotp: data.masterSwitches?.mfaTotp ?? true,
          },
          abuseLimits: {
            globalSignupVelocity: data.abuseLimits?.globalSignupVelocity ?? 500,
            globalBruteForceThreshold: data.abuseLimits?.globalBruteForceThreshold ?? 10,
            smsRegionFilter: data.abuseLimits?.smsRegionFilter ?? 'US, CA, GB, EU, AU, JP, SG',
          },
        });
      }

      if (emailAccRes.ok) {
        const accData = await emailAccRes.json();
        setEmailAccounts(accData.accounts || []);
      }

      if (policyRes.ok) {
        const polData = await policyRes.json();
        setGlobalEmailSending(polData.policy?.globalSendingEnabled ?? true);
      }

      if (queueRes.ok) {
        const qData = await queueRes.json();
        setQueueDepth(qData.metrics?.queueDepth || qData.metrics?.queued || 0);
      }
    } catch {
      addToast('Failed to load gateway governance configuration', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Toggle master killswitch
  const toggleMasterSwitch = async (key: keyof GlobalAuthConfig['masterSwitches']) => {
    const updatedSwitches = {
      ...authConfig.masterSwitches,
      [key]: !authConfig.masterSwitches[key],
    };

    setIsUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/auth/global-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          masterSwitches: updatedSwitches,
        }),
      });

      if (!res.ok) {
        addToast('Failed to persist killswitch state to API gateway', 'error');
        return;
      }

      setAuthConfig((prev) => ({
        ...prev,
        masterSwitches: updatedSwitches,
      }));

      const isNowEnabled = updatedSwitches[key];
      addToast(
        `Global Killswitch for ${key}: ${isNowEnabled ? 'ENABLED' : 'DISABLED (Platform-wide block engaged)'}`,
        isNowEnabled ? 'info' : 'warning'
      );
    } catch (err: any) {
      addToast(err.message || 'Network error updating master killswitch', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Save abuse limits
  const handleSaveAbuseLimits = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/auth/global-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({
          abuseLimits: authConfig.abuseLimits,
        }),
      });

      if (!res.ok) {
        addToast('Failed to persist abuse limit settings', 'error');
        return;
      }

      addToast('Platform abuse thresholds updated and enforced across all projects', 'success');
    } catch (err: any) {
      addToast(err.message || 'Network error saving limits', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const activeSwitchesCount = Object.values(authConfig.masterSwitches).filter(Boolean).length;
  const totalSwitchesCount = Object.keys(authConfig.masterSwitches).length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
              Authentication Governance &amp; Master Killswitches
            </h1>
            <Badge variant="success" dot>Fleet Governed</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Centralized platform-wide emergency killswitches for authentication methods, abuse velocity caps, and email delivery status.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={fetchConfig}
            disabled={isRefreshing}
            icon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          >
            {isRefreshing ? 'Synchronizing...' : 'Refresh Governance'}
          </Button>
        </div>
      </div>

      {/* Architecture Explanatory Banner */}
      <div
        style={{
          display: 'flex',
          gap: '14px',
          alignItems: 'flex-start',
          padding: '16px 20px',
          borderRadius: '8px',
          backgroundColor: 'rgba(37, 99, 235, 0.08)',
          border: '1px solid rgba(37, 99, 235, 0.25)',
          fontSize: '0.85rem',
          lineHeight: '1.5',
        }}
      >
        <Info size={20} color="var(--accent-blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
            Understanding Platform Authentication &amp; Email Governance:
          </strong>
          <span style={{ color: 'var(--text-secondary)' }}>
            <strong>Master Killswitches:</strong> Instantly disable authentication methods across the ENTIRE fleet. If an auth provider is disabled here, tenant projects cannot use it regardless of project settings.
            <br />
            <strong>Email Infrastructure:</strong> All platform and tenant emails are dispatched via the authoritative Brevo HTTPS delivery infrastructure at{' '}
            <Link href="/email" style={{ color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'underline' }}>
              /email (Global Email Infrastructure)
            </Link>.
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Master Killswitch Status
              </span>
              <ShieldAlert size={16} color="var(--accent-amber)" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '...' : `${activeSwitchesCount} / ${totalSwitchesCount} Active`}
            </div>
            <div style={{ fontSize: '12px', color: activeSwitchesCount === totalSwitchesCount ? 'var(--accent-emerald)' : 'var(--accent-amber)', marginTop: '8px' }}>
              {activeSwitchesCount === totalSwitchesCount ? 'Zero platform-wide emergency blocks' : 'Emergency blocks actively engaged'}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Email Delivery System
              </span>
              <Mail size={16} color="var(--accent-blue)" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '...' : `${emailAccounts.length} Account(s)`}
            </div>
            <div style={{ fontSize: '12px', color: globalEmailSending ? 'var(--accent-emerald)' : 'var(--accent-red)', marginTop: '8px' }}>
              {globalEmailSending ? 'Global Sending Active' : 'Emergency Shutdown Engaged'}
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Outbox Delivery Queue
              </span>
              <Radio size={16} color="var(--accent-emerald)" />
            </div>
            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {isLoading ? '...' : `${queueDepth} Queued`}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              Autonomous retry with exponential backoff
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <Button
          variant={activeTab === 'master_switches' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('master_switches')}
        >
          <KeyRound size={14} style={{ marginRight: '6px' }} />
          Global Auth Master Switches
        </Button>
        <Button
          variant={activeTab === 'abuse_limits' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('abuse_limits')}
        >
          <ShieldAlert size={14} style={{ marginRight: '6px' }} />
          Platform Abuse &amp; Velocity Limits
        </Button>
        <Button
          variant={activeTab === 'email_overview' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('email_overview')}
        >
          <Mail size={14} style={{ marginRight: '6px' }} />
          Email Delivery Telemetry
        </Button>
      </div>

      {/* TAB 1: Global Auth Master Switches */}
      {activeTab === 'master_switches' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Global Platform Master Provider Switches</CardTitle>
                <CardDescription>
                  Emergency operational killswitches. Disabling any switch here overrides all tenant project settings and blocks the method across the platform.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              {
                key: 'emailPassword' as const,
                title: 'Email & Password Authentication',
                desc: 'Argon2id / scrypt hashed credentials authentication for end-users.',
              },
              {
                key: 'anonymous' as const,
                title: 'Anonymous / Guest Authentication',
                desc: 'Ephemeral visitor sessions convertible to verified user accounts.',
              },
              {
                key: 'google' as const,
                title: 'Google OAuth 2.0 / OpenID Connect',
                desc: 'Google SSO token verification and profile synchronization.',
              },
              {
                key: 'github' as const,
                title: 'GitHub OAuth Gateway',
                desc: 'Developer single sign-on through GitHub user identity API.',
              },
              {
                key: 'apple' as const,
                title: 'Sign in with Apple',
                desc: 'Apple ES256 identity token verification with private relay email.',
              },
              {
                key: 'phone' as const,
                title: 'Phone / SMS OTP Gateway',
                desc: 'Transactional SMS one-time passcodes with global rate limits.',
              },
              {
                key: 'mfaTotp' as const,
                title: 'Multi-Factor TOTP (RFC 6238)',
                desc: 'Time-based one-time password second factor for high-security accounts.',
              },
            ].map(({ key, title, desc }) => {
              const isEnabled = authConfig.masterSwitches[key];
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderRadius: '8px',
                    backgroundColor: isEnabled ? 'var(--bg-surface)' : 'rgba(239, 68, 68, 0.05)',
                    border: `1px solid ${isEnabled ? 'var(--border-color)' : 'rgba(239, 68, 68, 0.3)'}`,
                  }}
                >
                  <div style={{ maxWidth: '650px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
                      {isEnabled ? (
                        <Badge variant="success">Operational</Badge>
                      ) : (
                        <Badge variant="danger">Emergency Blocked</Badge>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>{desc}</p>
                  </div>

                  <Button
                    variant={isEnabled ? 'destructive' : 'primary'}
                    size="sm"
                    onClick={() => toggleMasterSwitch(key)}
                    disabled={isUpdating}
                  >
                    {isEnabled ? 'Engage Killswitch' : 'Enable Globally'}
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* TAB 2: Abuse Limits */}
      {activeTab === 'abuse_limits' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Platform Abuse &amp; Velocity Quotas</CardTitle>
              <CardDescription>
                Fleet-wide rate limits and anti-credential stuffing protection enforced by the API gateway.
              </CardDescription>
            </div>
          </CardHeader>

          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Global Sign-Up Velocity Cap (Per Project / Hour)
                </label>
                <Input
                  type="number"
                  value={authConfig.abuseLimits.globalSignupVelocity}
                  onChange={(e) =>
                    setAuthConfig((prev) => ({
                      ...prev,
                      abuseLimits: {
                        ...prev.abuseLimits,
                        globalSignupVelocity: parseInt(e.target.value, 10) || 500,
                      },
                    }))
                  }
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Protects databases against automated mass-registration spam bots.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                  Brute-Force Lockout Threshold (Failed Attempts)
                </label>
                <Input
                  type="number"
                  value={authConfig.abuseLimits.globalBruteForceThreshold}
                  onChange={(e) =>
                    setAuthConfig((prev) => ({
                      ...prev,
                      abuseLimits: {
                        ...prev.abuseLimits,
                        globalBruteForceThreshold: parseInt(e.target.value, 10) || 10,
                      },
                    }))
                  }
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  IP is automatically banned and routed to DefenseService after this threshold.
                </span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                Permitted SMS OTP Country Codes (ISO 3166-1)
              </label>
              <Input
                type="text"
                value={authConfig.abuseLimits.smsRegionFilter}
                onChange={(e) =>
                  setAuthConfig((prev) => ({
                    ...prev,
                    abuseLimits: {
                      ...prev.abuseLimits,
                      smsRegionFilter: e.target.value,
                    },
                  }))
                }
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Prevents SMS toll-fraud by restricting OTP delivery to authorized jurisdictions.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <Button variant="primary" onClick={handleSaveAbuseLimits} disabled={isUpdating}>
                {isUpdating ? 'Saving Thresholds...' : 'Save &amp; Enforce Quotas'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* TAB 3: Email Delivery Telemetry */}
      {activeTab === 'email_overview' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <CardTitle>Email Delivery Infrastructure Status</CardTitle>
                <CardDescription>
                  Status of active Brevo HTTPS provider accounts and transactional delivery queues.
                </CardDescription>
              </div>
              <Link href="/email">
                <Button variant="primary" size="sm" icon={<ExternalLink size={13} />}>
                  Open Full Email Control Center
                </Button>
              </Link>
            </div>
          </CardHeader>

          <div style={{ padding: '0 24px 24px' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>Account Name</th>
                    <th style={{ padding: '12px 16px' }}>Provider Type</th>
                    <th style={{ padding: '12px 16px' }}>Daily Sent / Limit</th>
                    <th style={{ padding: '12px 16px' }}>Health Status</th>
                    <th style={{ padding: '12px 16px' }}>Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {emailAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No email provider accounts configured yet. Open the Email Control Center to add an account.
                      </td>
                    </tr>
                  ) : (
                    emailAccounts.map((acc) => (
                      <tr key={acc.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '14px 16px', fontWeight: 600 }}>{acc.accountName}</td>
                        <td style={{ padding: '14px 16px', textTransform: 'uppercase' }}>
                          <Badge variant="outline">{acc.providerType}</Badge>
                        </td>
                        <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)' }}>
                          {acc.dailySentCount} / {acc.dailyQuotaLimit}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <Badge variant={acc.status === 'healthy' ? 'success' : 'danger'}>
                            {acc.status}
                          </Badge>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {acc.isEnabled ? (
                            <span style={{ color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <CheckCircle2 size={13} /> Active
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Disabled</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
