'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Building2,
  Server,
  ShieldAlert,
  FileText,
  DatabaseBackup,
  ChevronRight,
  Menu,
  X,
  ExternalLink,
  Shield,
  Cpu,
  Lock,
  Sliders,
  KeyRound,
  Mail,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  RefreshCw,
  Check
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider } from './ui/Toast';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Command Center',
    items: [
      { name: 'Platform Overview', href: '/', icon: Activity },
      { name: 'Tenant Directory', href: '/tenants', icon: Building2 },
      { name: 'Plans & Limits', href: '/plans', icon: Sliders },
      { name: 'Auth & Gateways', href: '/gateways', icon: KeyRound },
      { name: 'Email Infrastructure', href: '/email', icon: Mail },
      { name: 'Engine & DB Health', href: '/health', icon: Server },
    ],
  },
  {
    label: 'Operations & Alerts',
    items: [
      { name: 'Notifications & Triage', href: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Security & Compliance',
    items: [
      { name: 'Zero-Trust SOC', href: '/soc', icon: ShieldAlert },
      { name: 'Tamper-Evident Audit', href: '/audit', icon: FileText },
      { name: 'Encrypted Backups / DR', href: '/backups', icon: DatabaseBackup },
    ],
  },
];

const ROUTE_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Fleet Overview', subtitle: 'Platform-wide telemetry, gateway routing, and multi-tenant performance' },
  '/tenants': { title: 'Tenant Directory', subtitle: 'Global tenant provisioning, quota caps, and access governance' },
  '/plans': { title: 'Plans & Capability Limits', subtitle: 'Authoritative plan definitions, feature capabilities, and tenant quota controls' },
  '/gateways': { title: 'Auth & Email Gateways', subtitle: 'Global authentication provider switches, multi-account email gateways, and abuse prevention' },
  '/email': { title: 'Global Email Infrastructure', subtitle: 'Brevo HTTPS API delivery, provider accounts, quota management, and outbox router' },
  '/notifications': { title: 'Operations Notifications & Triage', subtitle: 'Contact inquiries, provider quota warnings, and system alerts' },
  '/health': { title: 'Engine & DB Health', subtitle: 'PostgreSQL connection pools, outbox consumers, and Fastify health' },
  '/soc': { title: 'Zero-Trust SOC', subtitle: 'Autonomous threat defense, incident mitigation, and rate limiting rules' },
  '/audit': { title: 'Cryptographic Audit', subtitle: 'SHA-256 tamper-evident ledger and platform security events' },
  '/backups': { title: 'Disaster Recovery', subtitle: 'AES-256-GCM encrypted backups and automated restore verifications' },
};

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // Real RAM Telemetry & Notifications
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [realRam, setRealRam] = useState<{ usedGib: string; totalGib: string; percent: number; nodeRssMib: string } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const fetchTelemetry = async () => {
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('super_admin_token') || '') : '';
      const res = await fetch(`${API_BASE}/api/v1/admin/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.hostMemory) {
          setRealRam({
            usedGib: data.hostMemory.usedGib,
            totalGib: data.hostMemory.totalGib,
            percent: data.hostMemory.usedPercent,
            nodeRssMib: data.processMemory?.rssMib || '0',
          });
        }
      }
    } catch {}
  };

  const fetchNotifications = async () => {
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('super_admin_token') || '') : '';
      const res = await fetch(`${API_BASE}/api/v1/admin/notifications?limit=25`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  };

  const markNotificationRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('super_admin_token') || '') : '';
      await fetch(`${API_BASE}/api/v1/admin/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const markAllNotificationsRead = async () => {
    try {
      const token = typeof window !== 'undefined' ? (localStorage.getItem('super_admin_token') || '') : '';
      await fetch(`${API_BASE}/api/v1/admin/notifications/mark-all-read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {}
  };

  useEffect(() => {
    if (pathname === '/login') {
      setAuthChecked(true);
      return;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('super_admin_token') : null;
    if (!token) {
      router.replace('/login');
      return;
    }
    const email = localStorage.getItem('super_admin_email') || 'superadmin@syntrabase.internal';
    setAdminEmail(email);
    setAuthChecked(true);
  }, [pathname, router]);

  useEffect(() => {
    if (authChecked && pathname !== '/login') {
      fetchTelemetry();
      fetchNotifications();
      const interval = setInterval(() => {
        fetchTelemetry();
        fetchNotifications();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [authChecked, pathname]);

  if (pathname === '/login') {
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
          backgroundColor: '#0a0c10',
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
            border: '3px solid rgba(239, 68, 68, 0.2)',
            borderTopColor: '#ef4444',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ fontSize: '0.88rem', color: '#9ca3af' }}>Verifying Super Admin Authorization...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const currentRouteMeta = ROUTE_TITLES[pathname] || {
    title: pathname.replace('/', '').replace(/-/g, ' ').toUpperCase(),
    subtitle: 'Super Admin Operations Center',
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

      {/* Super Admin Sidebar */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Brand */}
        <div className="brand" style={{ paddingBottom: '16px' }}>
          <div
            className="brand-icon"
            style={{
              background: 'linear-gradient(135deg, #dc2626, #991b1b)',
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.3)',
            }}
          >
            <Shield size={20} color="#ffffff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              Syntrabase Ops
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent-rose)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Super Admin Center
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

        {/* Security Perimeter Badge */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 10px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-rose)',
              boxShadow: '0 0 6px var(--accent-rose)',
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 600 }}>
              Perimeter Access
            </div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Privileged Operator
            </div>
          </div>
          <Lock size={13} color="var(--text-muted)" />
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
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Traefik Edge</span>
            </div>
            <span className="badge badge-green" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>
              Coolify Verified
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
            <span>Node: vps-primary</span>
            <span style={{ fontSize: '0.7rem' }}>Session: Signed</span>
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
              <span style={{ color: 'var(--text-muted)' }}>Platform Ops</span>
              <ChevronRight size={14} color="var(--text-muted)" />
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{currentRouteMeta.title}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* SOC Threat Level Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}
              className="hide-mobile"
            >
              <ShieldAlert size={14} color="var(--accent-emerald)" />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>SOC THREAT:</span>
              <span className="badge badge-green" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>Level 0 · Nominal</span>
            </div>

            {/* VPS Resource Badge - Real Host Hardware RAM */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
              className="hide-mobile"
              title={realRam ? `Host Memory: ${realRam.usedGib} GiB used / ${realRam.totalGib} GiB total (${realRam.percent}%). Node Process RSS: ${realRam.nodeRssMib} MB.` : 'Loading live host hardware telemetry...'}
            >
              <Cpu size={13} color="var(--accent-blue)" />
              {realRam ? (
                <span>
                  RAM: <strong style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>{realRam.usedGib} / {realRam.totalGib} GiB</strong>
                  <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>({realRam.percent}%)</span>
                </span>
              ) : (
                <span>RAM: <strong style={{ color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>Reading...</strong></span>
              )}
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notification Bell Icon directly next to Theme Toggle */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="btn btn-ghost"
                style={{
                  position: 'relative',
                  padding: '7px 9px',
                  borderRadius: 'var(--radius-md)',
                  color: notificationsOpen ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                id="super-admin-notifications-toggle"
                aria-label="Platform Notifications"
                title={`${unreadCount} unread operational notifications`}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      minWidth: '16px',
                      height: '16px',
                      padding: '0 4px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--accent-rose)',
                      color: '#ffffff',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      boxShadow: '0 0 6px rgba(244, 63, 94, 0.6)',
                    }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {notificationsOpen && (
                <>
                  <div
                    onClick={() => setNotificationsOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 'calc(100% + 8px)',
                      width: '390px',
                      maxWidth: '92vw',
                      backgroundColor: '#0c111d',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      boxShadow: '0 25px 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.12)',
                      zIndex: 99999,
                      overflow: 'hidden',
                      opacity: 1,
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#161f30',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bell size={16} color="var(--accent-blue, #38bdf8)" />
                        <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f8fafc' }}>
                          Operational Alerts
                        </span>
                        {unreadCount > 0 && (
                          <span
                            className="badge badge-rose"
                            style={{ fontSize: '0.65rem', padding: '1px 6px', fontWeight: 700 }}
                          >
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          className="btn btn-ghost"
                          style={{ fontSize: '0.72rem', padding: '4px 10px', color: '#38bdf8', fontWeight: 600 }}
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    {/* List */}
                    <div style={{ maxHeight: '380px', overflowY: 'auto', backgroundColor: '#0c111d' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8', backgroundColor: '#0c111d' }}>
                          <CheckCircle2 size={30} color="#10b981" style={{ margin: '0 auto 10px' }} />
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>All Systems Nominal</div>
                          <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>No operational notifications recorded.</div>
                        </div>
                      ) : (
                        notifications.map((n) => {
                          const isWarning = n.severity === 'warning';
                          const isCritical = n.severity === 'critical';
                          return (
                            <div
                              key={n.id}
                              onClick={() => {
                                if (!n.isRead) markNotificationRead(n.id);
                                setNotificationsOpen(false);
                                if (n.category === 'contact' || n.relatedId?.startsWith('TKT-')) {
                                  router.push(`/notifications?tab=contact_inquiries&ticket=${encodeURIComponent(n.relatedId || '')}`);
                                } else {
                                  router.push('/notifications');
                                }
                              }}
                              style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid #161f30',
                                backgroundColor: n.isRead ? '#0c111d' : '#141c2e',
                                display: 'flex',
                                gap: '12px',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                            >
                              <div style={{ marginTop: '2px', flexShrink: 0 }}>
                                {isCritical || isWarning ? (
                                  <AlertTriangle size={16} color={isCritical ? '#ef4444' : '#f59e0b'} />
                                ) : (
                                  <Info size={16} color="#38bdf8" />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                  <span
                                    style={{
                                      fontSize: '0.82rem',
                                      fontWeight: n.isRead ? 600 : 700,
                                      color: n.isRead ? '#cbd5e1' : '#ffffff',
                                    }}
                                  >
                                    {n.title}
                                  </span>
                                  {!n.isRead && (
                                    <span
                                      style={{
                                        width: '7px',
                                        height: '7px',
                                        borderRadius: '50%',
                                        backgroundColor: '#ef4444',
                                        flexShrink: 0,
                                        boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
                                      }}
                                    />
                                  )}
                                </div>
                                <p
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#94a3b8',
                                    margin: '4px 0 6px',
                                    lineHeight: 1.45,
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {n.message}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', color: '#64748b' }}>
                                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{n.category}</span>
                                  <span>•</span>
                                  <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Footer */}
                    <div
                      style={{
                        padding: '10px 16px',
                        borderTop: '1px solid #1e293b',
                        backgroundColor: '#161f30',
                        textAlign: 'center',
                      }}
                    >
                      <Link
                        href="/notifications"
                        onClick={() => setNotificationsOpen(false)}
                        style={{
                          fontSize: '0.76rem',
                          color: '#38bdf8',
                          textDecoration: 'none',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        Open Full Notification Center →
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Super Admin User Profile with Interactive Dropdown */}
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
                    backgroundColor: 'var(--accent-rose)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  SA
                </div>
                <div className="hide-mobile" style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    superadmin@syntrabase.internal
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--accent-rose)', fontWeight: 600, lineHeight: 1 }}>
                    Privileged Root
                  </span>
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
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Authenticated As</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>superadmin@syntrabase.internal</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-rose)', fontWeight: 600 }}>Root Security Clearance</div>
                  </div>
                  <Link
                    href="/login"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        localStorage.removeItem('super_admin_token');
                        localStorage.removeItem('super_admin_refresh_token');
                        localStorage.removeItem('super_admin_email');
                        localStorage.removeItem('super_admin_user');
                      }
                      setProfileMenuOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      color: 'var(--accent-rose)',
                      textDecoration: 'none',
                      fontSize: '0.82rem',
                    }}
                    className="menu-item-hover"
                  >
                    <span>Lock Console / Sign Out</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="page-body">
          {children}
        </main>
      </div>
    </div>
  );
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ShellInner>{children}</ShellInner>
      </ToastProvider>
    </ThemeProvider>
  );
}
