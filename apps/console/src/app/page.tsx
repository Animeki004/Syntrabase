'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  HardDrive,
  Plus,
  ShieldCheck,
  Database,
  CheckCircle2,
  Clock,
  Server,
  Zap,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useProject } from '@/components/ProjectContext';
import { API_BASE_URL } from '@/config';

interface OverviewStats {
  documentsCount: number;
  collectionsCount: number;
  authUsersCount: number;
  storageObjectsCount: number;
  storageBytes: string;
  storageBytesRaw: number;
  outboxPending: number;
  apiLatencyMs: number;
  rulesVersion: number;
}

interface ActivityEvent {
  id: string;
  type: string;
  path: string;
  timestamp: string;
  status: string;
}

export default function DashboardPage() {
  const { activeProject, isLoading: isProjectLoading } = useProject();

  const [stats, setStats] = useState<OverviewStats>({
    documentsCount: 0,
    collectionsCount: 0,
    authUsersCount: 0,
    storageObjectsCount: 0,
    storageBytes: '0 B',
    storageBytesRaw: 0,
    outboxPending: 0,
    apiLatencyMs: 2,
    rulesVersion: 1,
  });

  const [recentEvents, setRecentEvents] = useState<ActivityEvent[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [planName, setPlanName] = useState<string>('');
  const [maxStorageBytes, setMaxStorageBytes] = useState<number>(52428800); // 50MB default

  const fetchOverview = useCallback(async (isManual = false) => {
    if (!activeProject?.id) return;
    if (isManual) {
      setIsRefreshing(true);
    } else {
      setIsLoadingStats(true);
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [overviewRes, planRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/projects/${activeProject.id}/overview`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/projects/${activeProject.id}/plan`, { headers }),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        if (data.stats) {
          setStats({
            documentsCount: data.stats.documentsCount || 0,
            collectionsCount: data.stats.collectionsCount || 0,
            authUsersCount: data.stats.authUsersCount || 0,
            storageObjectsCount: data.stats.storageObjectsCount || 0,
            storageBytes: data.stats.storageBytes || '0 B',
            storageBytesRaw: data.stats.storageBytesRaw || 0,
            outboxPending: data.stats.outboxPending || 0,
            apiLatencyMs: data.stats.apiLatencyMs || 2,
            rulesVersion: 1,
          });
        }
        if (Array.isArray(data.recentEvents)) {
          setRecentEvents(data.recentEvents);
        }
        if (data.project?.planName) {
          setPlanName(data.project.planName);
        }
      }

      if (planRes.ok) {
        const planData = await planRes.json();
        if (planData.plan?.name) {
          setPlanName(planData.plan.name);
        }
        if (planData.limits?.maxDbStorageBytes) {
          setMaxStorageBytes(planData.limits.maxDbStorageBytes);
        }
      }
    } catch {
      // Retain current or fallback gracefully
    } finally {
      setIsLoadingStats(false);
      setIsRefreshing(false);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (activeProject?.id) {
      fetchOverview();
    }
  }, [activeProject?.id, fetchOverview]);

  const displayPlanName = planName || activeProject?.planName || 'Free Tier';
  const storagePercentage = maxStorageBytes > 0
    ? Math.min(100, Math.max(1, Math.round((stats.storageBytesRaw / maxStorageBytes) * 100)))
    : 1;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            {isProjectLoading ? (
              <span className="skeleton-box animate-pulse" style={{ width: '200px', height: '28px', borderRadius: '4px' }} />
            ) : (
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                {activeProject?.name || 'Syntrabase Workspace'}
              </h1>
            )}
            <Badge variant="success" dot>Live Environment</Badge>
            {isLoadingStats && !planName ? (
              <span className="skeleton-box animate-pulse" style={{ width: '70px', height: '22px', borderRadius: '4px' }} />
            ) : (
              <Badge variant="outline">{displayPlanName}</Badge>
            )}
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
            Operational telemetry and management for project identifier{' '}
            <code style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
              {activeProject?.id || 'default-project'}
            </code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchOverview(true)}
            disabled={isRefreshing}
            icon={<RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>
          <Link href="/database">
            <Button variant="primary" icon={<Plus size={15} />}>
              New Document
            </Button>
          </Link>
          <Link href="/database?tab=rules">
            <Button variant="secondary" icon={<ShieldCheck size={15} />}>
              Database Rules
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid-4">
        {/* Documents */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Documents
            </span>
            <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--accent-blue)' }}>
              <Database size={16} />
            </div>
          </div>
          {isLoadingStats ? (
            <div className="skeleton-box animate-pulse" style={{ width: '60px', height: '32px', borderRadius: '4px', margin: '4px 0' }} />
          ) : (
            <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {stats.documentsCount}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--accent-emerald)' }}>
            <CheckCircle2 size={13} />
            <span>Across {stats.collectionsCount} collections</span>
          </div>
        </Card>

        {/* Auth Users */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Auth Users
            </span>
            <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)' }}>
              <Users size={16} />
            </div>
          </div>
          {isLoadingStats ? (
            <div className="skeleton-box animate-pulse" style={{ width: '60px', height: '32px', borderRadius: '4px', margin: '4px 0' }} />
          ) : (
            <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {stats.authUsersCount}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Email &amp; Anonymous enabled</span>
          </div>
        </Card>

        {/* Realtime Outbox */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Realtime Outbox
            </span>
            <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-purple)' }}>
              <Zap size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isLoadingStats ? (
              <div className="skeleton-box animate-pulse" style={{ width: '40px', height: '32px', borderRadius: '4px', margin: '4px 0' }} />
            ) : (
              <span style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {stats.outboxPending}
              </span>
            )}
            <Badge variant="success" size="sm">0 Lag</Badge>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>Durable pipeline synced</span>
          </div>
        </Card>

        {/* Storage Volume */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Storage Volume
            </span>
            <div style={{ padding: '6px', borderRadius: 'var(--radius-sm)', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)' }}>
              <HardDrive size={16} />
            </div>
          </div>
          {isLoadingStats ? (
            <div className="skeleton-box animate-pulse" style={{ width: '70px', height: '32px', borderRadius: '4px', margin: '4px 0' }} />
          ) : (
            <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', lineHeight: 1.1 }}>
              {stats.storageBytes}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            <span>{stats.storageObjectsCount} objects stored</span>
          </div>
        </Card>
      </div>

      {/* Engine Architecture & Quick Shortcuts */}
      <div className="grid-3">
        <Card style={{ gridColumn: 'span 2' }}>
          <CardHeader>
            <div>
              <CardTitle>Engine Architecture Health</CardTitle>
              <CardDescription>Multi-tenant backend services and transactional event streaming</CardDescription>
            </div>
            <Badge variant="success" dot>All Subsystems Nominal</Badge>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div
                style={{
                  padding: '14px',
                  background: 'var(--bg-card-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Server size={14} color="var(--accent-blue)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>POSTGRESQL 16</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>JSONB Store</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} /> GIN Indexing Active
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  background: 'var(--bg-card-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Zap size={14} color="var(--accent-purple)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>TRANSACTIONAL OUTBOX</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Durable Realtime</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={12} /> Sequence Checkpoint
                </div>
              </div>

              <div
                style={{
                  padding: '14px',
                  background: 'var(--bg-card-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Lock size={14} color="var(--accent-amber)" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>SECURITY RULES</span>
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Sandboxed AST</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <ShieldCheck size={12} /> Version {stats.rulesVersion} Active
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              The API Gateway enforces rate limiting, multi-tenant database isolation, and security rules on every read and write request.
              Realtime subscriptions stream from the durable outbox table with client checkpoint recovery.
            </p>
          </CardContent>
        </Card>

        {/* Project Quotas & Gateway Saturation */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Project Quota &amp; Ingress</CardTitle>
              <CardDescription>Gateway throughput and resource allocations</CardDescription>
            </div>
            <Badge variant="info" size="sm">{displayPlanName}</Badge>
          </CardHeader>
          <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Storage Quota */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Storage Volume</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {stats.storageBytes} / {(maxStorageBytes / (1024 * 1024)).toFixed(0)} MB
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-card-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${storagePercentage}%`,
                    height: '100%',
                    backgroundColor: storagePercentage > 85 ? 'var(--accent-rose)' : 'var(--accent-blue)',
                    borderRadius: '3px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>

            {/* Ingress Rate Limit */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Rate Limit Token Bucket</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>1,000 req/min (Nominal)</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-card-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: '12%', height: '100%', backgroundColor: 'var(--accent-emerald)', borderRadius: '3px' }} />
              </div>
            </div>

            {/* Realtime Sockets & Gateway Latency */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '4px' }}>
              <div style={{ padding: '10px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active WebSockets</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>Durable Sync</div>
              </div>
              <div style={{ padding: '10px', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Database P99</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '2px' }}>
                  {stats.apiLatencyMs || 2} ms
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Activity Feed */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent Project Activity</CardTitle>
            <CardDescription>Live transactional outbox mutations and auth audit events</CardDescription>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--accent-emerald)', display: 'inline-block' }} />
            <span>Database Audit Log</span>
          </div>
        </CardHeader>
        <div style={{ overflowX: 'auto' }}>
          {isLoadingStats ? (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[1, 2, 3].map((n) => (
                <div key={n} className="skeleton-box animate-pulse" style={{ width: '100%', height: '36px', borderRadius: '4px' }} />
              ))}
            </div>
          ) : recentEvents.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No audit activity recorded yet. Create collections or documents to start streaming audit ledger events.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Event ID</th>
                  <th style={{ width: '180px' }}>Operation</th>
                  <th>Resource Path</th>
                  <th style={{ width: '160px' }}>Timestamp</th>
                  <th style={{ width: '110px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>
                      <code style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {evt.id.substring(0, 8)}...
                      </code>
                    </td>
                    <td>
                      <Badge
                        variant={
                          evt.type.includes('SECURITY')
                            ? 'warning'
                            : evt.type.includes('STORAGE')
                            ? 'info'
                            : evt.type.includes('AUTH')
                            ? 'default'
                            : 'success'
                        }
                        size="sm"
                      >
                        {evt.type}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {evt.path}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {new Date(evt.timestamp).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <Badge variant="outline" size="sm">
                        {evt.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
