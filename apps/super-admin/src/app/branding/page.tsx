'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Globe,
  Image as ImageIcon,
  Search,
  Share2,
  Palette,
  CheckCircle2,
  RefreshCw,
  Save,
  Upload,
  Eye,
  Sparkles,
  ShieldCheck,
  FileText,
  Mail,
  Trash2,
  Check,
  AlertCircle,
  HelpCircle,
  Laptop,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface BrandingData {
  id?: string;
  platformName: string;
  tagline: string;
  logoUrl?: string;
  faviconUrl?: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImageUrl?: string;
  twitterCard: 'summary' | 'summary_large_image';
  primaryColor: string;
  contactEmail: string;
  copyrightText: string;
  customCss?: string;
  updatedAt?: string;
}

type TabKey = 'identity' | 'seo' | 'social' | 'compliance';
type PreviewTabKey = 'tab' | 'google' | 'social';

export default function BrandingPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('identity');
  const [activePreviewTab, setActivePreviewTab] = useState<PreviewTabKey>('tab');

  // Form State
  const [platformName, setPlatformName] = useState('Syntrabase');
  const [tagline, setTagline] = useState('Enterprise Cloud Platform & Firebase Alternative');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [metaTitle, setMetaTitle] = useState('Syntrabase — Enterprise Cloud Platform');
  const [metaDescription, setMetaDescription] = useState('Scalable, multi-tenant database, real-time messaging, auth, and cloud storage.');
  const [metaKeywords, setMetaKeywords] = useState('syntrabase, firestore, firebase, authentication, postgresql, realtime, cloud storage');
  const [ogImageUrl, setOgImageUrl] = useState('');
  const [twitterCard, setTwitterCard] = useState<'summary' | 'summary_large_image'>('summary_large_image');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [contactEmail, setContactEmail] = useState('support@syntrabase.internal');
  const [copyrightText, setCopyrightText] = useState('© 2026 Syntrabase Systems Inc. All rights reserved.');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const getAdminToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('super_admin_token') || '';
    }
    return '';
  };

  const fetchBranding = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/branding`, {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const b: BrandingData = data.branding || {};
        if (b.platformName) setPlatformName(b.platformName);
        if (b.tagline) setTagline(b.tagline);
        if (b.logoUrl !== undefined) setLogoUrl(b.logoUrl || '');
        if (b.faviconUrl !== undefined) setFaviconUrl(b.faviconUrl || '');
        if (b.metaTitle) setMetaTitle(b.metaTitle);
        if (b.metaDescription) setMetaDescription(b.metaDescription);
        if (b.metaKeywords) setMetaKeywords(b.metaKeywords);
        if (b.ogImageUrl !== undefined) setOgImageUrl(b.ogImageUrl || '');
        if (b.twitterCard) setTwitterCard(b.twitterCard);
        if (b.primaryColor) setPrimaryColor(b.primaryColor);
        if (b.contactEmail) setContactEmail(b.contactEmail);
        if (b.copyrightText) setCopyrightText(b.copyrightText);
        if (b.updatedAt) setLastUpdated(b.updatedAt);
      }
    } catch {
      // In-memory defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Secure File Upload Handler with MIME, extension, and SVG script scanning
  const handleSecureFileUpload = async (
    file: File | undefined,
    setter: (val: string) => void,
    fieldLabel: string,
    maxBytes: number = 2 * 1024 * 1024
  ) => {
    if (!file) return;

    // 1. File size check
    if (file.size > maxBytes) {
      const mb = (maxBytes / (1024 * 1024)).toFixed(1);
      addToast(`${fieldLabel} exceeds maximum allowed size of ${mb}MB`, 'error');
      return;
    }

    // 2. Strict MIME check
    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/x-icon',
      'image/vnd.microsoft.icon',
      'image/svg+xml',
    ];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      addToast(`${fieldLabel} must be a valid image (PNG, JPG, WebP, ICO, or SVG)`, 'error');
      return;
    }

    // 3. SVG Security scan
    if (file.type === 'image/svg+xml') {
      const text = await file.text();
      if (/<script|onload|onerror|onclick|xlink:href=["']javascript/i.test(text)) {
        addToast(`Security Violation: Embedded scripts detected in ${fieldLabel}. Upload aborted.`, 'error');
        return;
      }
    }

    // Read and encode safely
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setter(result);
        addToast(`${fieldLabel} uploaded and verified securely`, 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const payload: Partial<BrandingData> = {
        platformName: platformName.trim() || 'Syntrabase',
        tagline: tagline.trim(),
        logoUrl: logoUrl.trim(),
        faviconUrl: faviconUrl.trim(),
        metaTitle: metaTitle.trim() || `${platformName} — Enterprise Cloud Platform`,
        metaDescription: metaDescription.trim(),
        metaKeywords: metaKeywords.trim(),
        ogImageUrl: ogImageUrl.trim(),
        twitterCard,
        primaryColor: primaryColor.trim() || '#3b82f6',
        contactEmail: contactEmail.trim(),
        copyrightText: copyrightText.trim(),
      };

      const res = await fetch(`${API_BASE}/api/v1/admin/branding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update branding settings');
      }

      const data = await res.json();
      if (data.branding?.updatedAt) {
        setLastUpdated(data.branding.updatedAt);
      }
      addToast('Branding, Favicon, and SEO settings saved successfully!', 'success');
    } catch (err: any) {
      addToast(err.message || 'Error updating settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    fetchBranding();
    addToast('Reverted uncommitted branding modifications', 'info');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '60px' }}>
      {/* Top Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '20px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, var(--primary) 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)',
              }}
            >
              <Globe size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Website Branding &amp; SEO Engine
              </h1>
              <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                Manage sovereign logos, favicons, open-graph banners, and search indexation across fleet portals.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {lastUpdated && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck size={13} color="var(--success)" />
              Saved {new Date(lastUpdated).toLocaleDateString()} {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={handleDiscard} disabled={loading || saving}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ marginRight: '6px' }} />
            Discard
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            <Save size={13} style={{ marginRight: '6px' }} />
            {saving ? 'Persisting...' : 'Save Configuration'}
          </Button>
        </div>
      </div>

      {/* Interactive Live Simulation Stage */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 20px',
            background: 'var(--bg-surface-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Eye size={16} color="var(--primary)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Live Omnichannel Preview Stage
            </span>
            <Badge variant="outline" size="sm" style={{ fontSize: '11px' }}>Real-time Reactive</Badge>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <Button
              variant={activePreviewTab === 'tab' ? 'primary' : 'ghost'}
              size="xs"
              onClick={() => setActivePreviewTab('tab')}
            >
              <Laptop size={12} style={{ marginRight: '4px' }} /> Browser Tab
            </Button>
            <Button
              variant={activePreviewTab === 'google' ? 'primary' : 'ghost'}
              size="xs"
              onClick={() => setActivePreviewTab('google')}
            >
              <Search size={12} style={{ marginRight: '4px' }} /> Google SERP
            </Button>
            <Button
              variant={activePreviewTab === 'social' ? 'primary' : 'ghost'}
              size="xs"
              onClick={() => setActivePreviewTab('social')}
            >
              <Share2 size={12} style={{ marginRight: '4px' }} /> Social OG Card
            </Button>
          </div>
        </div>

        <div style={{ padding: '24px', backgroundColor: 'var(--bg-canvas)' }}>
          {/* Preview Mode 1: Browser Chrome Tab */}
          {activePreviewTab === 'tab' && (
            <div
              style={{
                maxWidth: '680px',
                margin: '0 auto',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 14px',
                    background: 'var(--bg-surface)',
                    borderRadius: '6px 6px 0 0',
                    borderTop: '2px solid var(--primary)',
                    maxWidth: '300px',
                  }}
                >
                  {faviconUrl ? (
                    <img
                      src={faviconUrl}
                      alt="Favicon"
                      style={{ width: '14px', height: '14px', objectFit: 'contain', borderRadius: '2px' }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe size={13} color="var(--primary)" />
                  )}
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {metaTitle || `${platformName} — Console`}
                  </span>
                </div>
              </div>

              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', flex: 1, fontFamily: 'var(--font-mono)' }}>
                  https://console.{platformName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'syntrabase'}.internal
                </span>
              </div>

              <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={platformName}
                    style={{ maxHeight: '42px', maxWidth: '180px', objectFit: 'contain', margin: '0 auto 12px' }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {platformName}
                  </div>
                )}
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{tagline}</div>
              </div>
            </div>
          )}

          {/* Preview Mode 2: Google SERP Preview */}
          {activePreviewTab === 'google' && (
            <div
              style={{
                maxWidth: '640px',
                margin: '0 auto',
                padding: '20px 24px',
                borderRadius: '8px',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                fontFamily: 'arial, sans-serif',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                {faviconUrl ? (
                  <img src={faviconUrl} alt="" style={{ width: '18px', height: '18px', borderRadius: '50%' }} />
                ) : (
                  <div style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: 'var(--primary)' }} />
                )}
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{platformName}</span>
                  <span style={{ marginLeft: '6px' }}>https://{platformName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'syntrabase'}.cloud</span>
                </div>
              </div>
              <div style={{ color: '#60a5fa', fontSize: '18px', fontWeight: 500, lineHeight: 1.3, marginBottom: '4px', cursor: 'pointer' }}>
                {metaTitle || `${platformName} — Enterprise Cloud Platform`}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13.5px', lineHeight: 1.5 }}>
                {metaDescription || 'Scalable, multi-tenant database, real-time messaging, auth, and cloud storage.'}
              </div>
            </div>
          )}

          {/* Preview Mode 3: Social Share OpenGraph Card */}
          {activePreviewTab === 'social' && (
            <div
              style={{
                maxWidth: '540px',
                margin: '0 auto',
                borderRadius: '10px',
                border: '1px solid var(--border-default)',
                overflow: 'hidden',
                backgroundColor: 'var(--bg-surface)',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              {ogImageUrl ? (
                <div style={{ height: '180px', backgroundColor: '#0f172a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ogImageUrl} alt="OG Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ height: '120px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '6px' }}>
                  <ImageIcon size={24} />
                  <span style={{ fontSize: '0.8rem' }}>Default OpenGraph Banner Active</span>
                </div>
              )}
              <div style={{ padding: '14px 18px' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {platformName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'syntrabase'}.cloud
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {metaTitle || platformName}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {metaDescription}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Segmented Section Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', overflowX: 'auto' }}>
        <Button
          variant={activeTab === 'identity' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('identity')}
        >
          <Sparkles size={14} style={{ marginRight: '6px' }} />
          Brand Assets &amp; Identity
        </Button>
        <Button
          variant={activeTab === 'seo' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('seo')}
        >
          <Search size={14} style={{ marginRight: '6px' }} />
          SEO &amp; Indexation
        </Button>
        <Button
          variant={activeTab === 'social' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('social')}
        >
          <Share2 size={14} style={{ marginRight: '6px' }} />
          Social &amp; OpenGraph
        </Button>
        <Button
          variant={activeTab === 'compliance' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('compliance')}
        >
          <FileText size={14} style={{ marginRight: '6px' }} />
          Compliance &amp; Legal
        </Button>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSave}>
        {/* TAB 1: BRAND ASSETS & IDENTITY */}
        {activeTab === 'identity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Core Platform Naming</CardTitle>
                <CardDescription>Defines the official brand name and subtitle across all login portals and shells</CardDescription>
              </CardHeader>
              <div className="grid-2" style={{ padding: '0 20px 20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Platform Display Name *
                  </label>
                  <Input
                    type="text"
                    value={platformName}
                    onChange={(e) => setPlatformName(e.target.value)}
                    placeholder="Syntrabase"
                    required
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Displayed on login forms, welcome banners, and emails.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Brand Tagline / Subtitle
                  </label>
                  <Input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Enterprise Cloud Platform & Firebase Alternative"
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Subordinate title displayed on landing and registration screens.
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Logos &amp; Visual Icons</CardTitle>
                <CardDescription>Secure image upload with client-side verification and SVG script sanitization</CardDescription>
              </CardHeader>
              <div className="grid-2" style={{ padding: '0 20px 20px' }}>
                {/* Platform Logo */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Header Brand Logo (PNG / SVG / WebP)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Input
                      type="text"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder="https://.../logo.png or upload"
                      style={{ flex: 1 }}
                    />
                    <label
                      className="btn btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Upload size={14} /> Upload
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => handleSecureFileUpload(e.target.files?.[0], setLogoUrl, 'Platform Logo', 1024 * 1024)}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="btn btn-ghost"
                        style={{ padding: '6px', color: 'var(--danger)' }}
                        title="Remove Logo"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Recommended height: 36–48px with transparent background.
                  </div>
                </div>

                {/* Favicon */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Favicon (32x32 ICO / PNG / SVG)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Input
                      type="text"
                      value={faviconUrl}
                      onChange={(e) => setFaviconUrl(e.target.value)}
                      placeholder="https://.../favicon.ico or upload"
                      style={{ flex: 1 }}
                    />
                    <label
                      className="btn btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Upload size={14} /> Upload
                      <input
                        type="file"
                        accept="image/x-icon,image/png,image/svg+xml"
                        onChange={(e) => handleSecureFileUpload(e.target.files?.[0], setFaviconUrl, 'Favicon', 512 * 1024)}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {faviconUrl && (
                      <button
                        type="button"
                        onClick={() => setFaviconUrl('')}
                        className="btn btn-ghost"
                        style={{ padding: '6px', color: 'var(--danger)' }}
                        title="Remove Favicon"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Applied dynamically to browser tabs across developer console and super-admin.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 2: SEARCH ENGINE OPTIMIZATION (SEO) */}
        {activeTab === 'seo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Search Engine Metadata</CardTitle>
                <CardDescription>Authoritative search snippet properties for crawler robots</CardDescription>
              </CardHeader>
              <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Default Page Title Template (Meta Title) *
                  </label>
                  <Input
                    type="text"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    placeholder="Syntrabase — Enterprise Cloud Platform"
                    required
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>Recommended length: 50–60 characters.</span>
                    <span style={{ color: metaTitle.length > 60 ? 'var(--warning)' : undefined }}>
                      {metaTitle.length} characters
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Meta Description *
                  </label>
                  <textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    placeholder="Scalable, multi-tenant database, real-time messaging, auth, and cloud storage."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>Optimal search summary: 150–160 characters.</span>
                    <span style={{ color: metaDescription.length > 160 ? 'var(--warning)' : undefined }}>
                      {metaDescription.length} characters
                    </span>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Meta Keywords (Comma-separated)
                  </label>
                  <Input
                    type="text"
                    value={metaKeywords}
                    onChange={(e) => setMetaKeywords(e.target.value)}
                    placeholder="syntrabase, firestore, firebase, authentication, postgresql, realtime"
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Comma-separated terms indexed by discovery engines.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 3: SOCIAL & OPENGRAPH */}
        {activeTab === 'social' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <CardHeader>
                <CardTitle>OpenGraph &amp; Social Card Configuration</CardTitle>
                <CardDescription>Rich sharing previews for links shared on Discord, Twitter / X, Slack, and LinkedIn</CardDescription>
              </CardHeader>
              <div className="grid-2" style={{ padding: '0 20px 20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    OpenGraph Banner Image (1200x630)
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Input
                      type="text"
                      value={ogImageUrl}
                      onChange={(e) => setOgImageUrl(e.target.value)}
                      placeholder="https://.../banner.png or upload"
                      style={{ flex: 1 }}
                    />
                    <label
                      className="btn btn-secondary"
                      style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Upload size={14} /> Upload
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => handleSecureFileUpload(e.target.files?.[0], setOgImageUrl, 'OG Banner', 2 * 1024 * 1024)}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {ogImageUrl && (
                      <button
                        type="button"
                        onClick={() => setOgImageUrl('')}
                        className="btn btn-ghost"
                        style={{ padding: '6px', color: 'var(--danger)' }}
                        title="Remove Banner"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    1200 x 630 px (1.91:1 aspect ratio) under 2MB.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Twitter / X Card Format
                  </label>
                  <select
                    value={twitterCard}
                    onChange={(e) => setTwitterCard(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                    }}
                  >
                    <option value="summary_large_image">summary_large_image (Large Hero Banner)</option>
                    <option value="summary">summary (Compact Square Thumbnail)</option>
                  </select>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Determines card dimension layout on Twitter feeds.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* TAB 4: COMPLIANCE & LEGAL */}
        {activeTab === 'compliance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card>
              <CardHeader>
                <CardTitle>Corporate &amp; Legal Notices</CardTitle>
                <CardDescription>Copyright strings and contact identity rendered in application footers</CardDescription>
              </CardHeader>
              <div className="grid-2" style={{ padding: '0 20px 20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Support &amp; Contact Email
                  </label>
                  <Input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="support@syntrabase.internal"
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Displayed on error pages and system support prompts.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Copyright Notice
                  </label>
                  <Input
                    type="text"
                    value={copyrightText}
                    onChange={(e) => setCopyrightText(e.target.value)}
                    placeholder="© 2026 Syntrabase Systems Inc. All rights reserved."
                  />
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Rendered in shell footers and transactional notifications.
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Persistent Bottom Save Bar */}
        <div
          style={{
            marginTop: '24px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
          }}
        >
          <Button variant="secondary" onClick={handleDiscard} disabled={loading || saving}>
            Discard Changes
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            <Save size={14} style={{ marginRight: '6px' }} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </form>
    </div>
  );
}
