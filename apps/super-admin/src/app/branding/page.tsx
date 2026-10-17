'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Link as LinkIcon,
  Eye,
  Sparkles,
  Info,
  Shield,
  Layers,
  FileText,
  Mail,
  ExternalLink,
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

export default function BrandingPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  // Convert uploaded image file to Data URL
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void,
    fieldLabel: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      addToast(`${fieldLabel} must be smaller than 2MB`, 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setter(result);
        addToast(`${fieldLabel} loaded successfully`, 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '60px' }}>
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Globe size={26} color="var(--primary)" />
            Website Branding & SEO
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Configure custom Favicon, Platform Logo, SEO Meta Tags, OpenGraph Cards, and appearance across the fleet.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Button variant="outline" onClick={fetchBranding} disabled={loading || saving}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} style={{ marginRight: '6px' }} /> Refresh
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            <Save size={15} style={{ marginRight: '6px' }} /> {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Real-time Previews Carousel / Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Preview 1: Browser Tab Preview */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={16} color="var(--primary)" />
              <CardTitle style={{ fontSize: '0.95rem' }}>Browser Tab & Favicon</CardTitle>
            </div>
            <CardDescription>Live simulation of how your platform displays in browser tabs</CardDescription>
          </CardHeader>
          <div
            style={{
              padding: '14px',
              backgroundColor: '#161922',
              borderRadius: '8px',
              border: '1px solid #282f3e',
            }}
          >
            {/* Mock browser chrome bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#eab308' }} />
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#1f2430',
                  padding: '4px 12px',
                  borderRadius: '6px 6px 0 0',
                  marginLeft: '8px',
                  maxWidth: '240px',
                  borderTop: '1px solid #3b82f6',
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
                  <Globe size={14} color="#3b82f6" />
                )}
                <span style={{ fontSize: '12px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {metaTitle || `${platformName} — Console`}
                </span>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {faviconUrl ? '✓ Custom Favicon Loaded' : '⚠ Using Default Syntrabase Favicon'}
            </div>
          </div>
        </Card>

        {/* Preview 2: Google SERP Preview */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={16} color="#3b82f6" />
              <CardTitle style={{ fontSize: '0.95rem' }}>Google Search Result</CardTitle>
            </div>
            <CardDescription>Simulated appearance in Google, Bing, and search engines</CardDescription>
          </CardHeader>
          <div
            style={{
              padding: '14px',
              backgroundColor: '#161922',
              borderRadius: '8px',
              border: '1px solid #282f3e',
              fontFamily: 'arial, sans-serif',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              {faviconUrl ? (
                <img src={faviconUrl} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />
              ) : (
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
              )}
              <div style={{ fontSize: '12px', color: '#bdc1c6', lineHeight: 1.2 }}>
                <span style={{ fontWeight: 600 }}>{platformName}</span>
                <span style={{ color: '#9aa0a6', marginLeft: '6px' }}>https://syntrabase.cloud</span>
              </div>
            </div>
            <div style={{ color: '#8ab4f8', fontSize: '16px', fontWeight: 400, lineHeight: 1.3, marginBottom: '4px', cursor: 'pointer' }}>
              {metaTitle || `${platformName} — Enterprise Cloud Platform`}
            </div>
            <div style={{ color: '#bdc1c6', fontSize: '13px', lineHeight: 1.4 }}>
              {metaDescription || 'Scalable, multi-tenant database, real-time messaging, auth, and cloud storage.'}
            </div>
          </div>
        </Card>

        {/* Preview 3: Social Share OpenGraph Card */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={16} color="#10b981" />
              <CardTitle style={{ fontSize: '0.95rem' }}>Social Card (OG / Twitter)</CardTitle>
            </div>
            <CardDescription>Preview for Twitter, Discord, Slack, and LinkedIn links</CardDescription>
          </CardHeader>
          <div
            style={{
              borderRadius: '8px',
              border: '1px solid #282f3e',
              overflow: 'hidden',
              backgroundColor: '#161922',
            }}
          >
            {ogImageUrl ? (
              <div style={{ height: '100px', backgroundColor: '#0f172a', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={ogImageUrl} alt="OG Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ) : (
              <div style={{ height: '70px', backgroundColor: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '12px', gap: '6px' }}>
                <ImageIcon size={18} /> Default OG Image
              </div>
            )}
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                syntrabase.cloud
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9', margin: '2px 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {metaTitle || platformName}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {metaDescription}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Section 1: Platform Brand Assets */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--primary)" />
              <CardTitle>1. Brand Assets & Identity</CardTitle>
            </div>
            <CardDescription>Primary logo, favicon, and brand naming reflected across all user portals</CardDescription>
          </CardHeader>

          <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
            {/* Platform Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Platform Name *
              </label>
              <Input
                type="text"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="Syntrabase"
                required
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Appears on login screens, navigation titles, and system notices.
              </div>
            </div>

            {/* Tagline */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Tagline / Slogan
              </label>
              <Input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Enterprise Cloud Platform & Firebase Alternative"
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Displayed under brand headers and marketing pages.
              </div>
            </div>

            {/* Favicon URL & Upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Favicon (32x32 ICO, PNG, or SVG)
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
                    onChange={(e) => handleFileUpload(e, setFaviconUrl, 'Favicon')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Replaces standard browser tab icon on console, super-admin, and landing pages.
              </div>
            </div>

            {/* Platform Logo URL & Upload */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Platform Logo URL / Asset
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
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, setLogoUrl, 'Platform Logo')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Rendered on navigation headers and welcome screens.
              </div>
            </div>
          </div>
        </Card>

        {/* Section 2: Search Engine Optimization (SEO) */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Search size={18} color="#3b82f6" />
              <CardTitle>2. Search Engine Optimization (SEO)</CardTitle>
            </div>
            <CardDescription>Default search engine title templates, descriptions, and crawler keywords</CardDescription>
          </CardHeader>

          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Meta Title */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Page Title Template (Meta Title) *
              </label>
              <Input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder="Syntrabase — Enterprise Cloud Platform"
                required
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Optimal length: 50–60 characters. Current: {metaTitle.length} characters.
              </div>
            </div>

            {/* Meta Description */}
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
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>Summary shown in search snippets. Recommended: 150–160 characters.</span>
                <span style={{ color: metaDescription.length > 160 ? 'var(--warning)' : undefined }}>
                  {metaDescription.length} characters
                </span>
              </div>
            </div>

            {/* Meta Keywords */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Meta Keywords (Comma-separated)
              </label>
              <Input
                type="text"
                value={metaKeywords}
                onChange={(e) => setMetaKeywords(e.target.value)}
                placeholder="syntrabase, firestore, firebase, authentication, postgresql, cloud"
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Relevant search terms separated by commas for search engines and indexing robots.
              </div>
            </div>
          </div>
        </Card>

        {/* Section 3: OpenGraph & Social Sharing */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={18} color="#10b981" />
              <CardTitle>3. OpenGraph & Social Cards</CardTitle>
            </div>
            <CardDescription>Social sharing banner images and preview cards for Discord, Twitter, and Slack</CardDescription>
          </CardHeader>

          <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
            {/* OG Image URL */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                OpenGraph Image URL (1200x630 recommended)
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Input
                  type="text"
                  value={ogImageUrl}
                  onChange={(e) => setOgImageUrl(e.target.value)}
                  placeholder="https://.../og-banner.png or upload"
                  style={{ flex: 1 }}
                />
                <label
                  className="btn btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <Upload size={14} /> Upload
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, setOgImageUrl, 'OG Image')}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                High-resolution social banner for links shared across platforms.
              </div>
            </div>

            {/* Twitter Card Type */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Twitter / X Card Type
              </label>
              <select
                value={twitterCard}
                onChange={(e) => setTwitterCard(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: '0.88rem',
                }}
              >
                <option value="summary_large_image">summary_large_image (Large Hero Banner)</option>
                <option value="summary">summary (Compact Square Thumbnail)</option>
              </select>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Controls how Twitter/X renders link cards when shared.
              </div>
            </div>
          </div>
        </Card>

        {/* Section 4: Platform Appearance & Legal */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={18} color="#eab308" />
              <CardTitle>4. Appearance, Contact & Copyright</CardTitle>
            </div>
            <CardDescription>Primary brand accent color and official platform contact coordinates</CardDescription>
          </CardHeader>

          <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
            {/* Primary Accent Color */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Primary Accent Color
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    width: '42px',
                    height: '38px',
                    padding: '2px',
                    borderRadius: '6px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-default)',
                    cursor: 'pointer',
                  }}
                />
                <Input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#3b82f6"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Brand accent used across buttons, indicators, and links.
              </div>
            </div>

            {/* Support / Contact Email */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Support & Contact Email
              </label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="support@syntrabase.internal"
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Address published in platform footers and system emails.
              </div>
            </div>

            {/* Copyright Notice */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                Copyright Text
              </label>
              <Input
                type="text"
                value={copyrightText}
                onChange={(e) => setCopyrightText(e.target.value)}
                placeholder="© 2026 Syntrabase Systems Inc. All rights reserved."
              />
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Rendered on public and console layouts.
              </div>
            </div>
          </div>
        </Card>

        {/* Bottom Save Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {lastUpdated ? (
              <span>Last updated: <strong style={{ color: 'var(--text-primary)' }}>{new Date(lastUpdated).toLocaleString()}</strong></span>
            ) : (
              <span>Unsaved changes</span>
            )}
          </div>
          <Button variant="primary" type="submit" disabled={saving}>
            <Save size={15} style={{ marginRight: '6px' }} /> {saving ? 'Saving...' : 'Save Branding & SEO'}
          </Button>
        </div>
      </form>
    </div>
  );
}
