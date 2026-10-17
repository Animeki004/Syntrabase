-- =============================================================================
-- MIGRATION 016: PLATFORM BRANDING & GLOBAL SEO CONFIGURATION
-- Modules: Platform Name, Favicon, Logo, SEO Meta Tags, Social OG Cards
-- =============================================================================

CREATE TABLE IF NOT EXISTS platform_branding (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'global',
  platform_name VARCHAR(255) NOT NULL DEFAULT 'Syntrabase',
  tagline VARCHAR(255) DEFAULT 'Enterprise Cloud Platform & Firebase Alternative',
  logo_url TEXT,
  favicon_url TEXT,
  meta_title VARCHAR(255) DEFAULT 'Syntrabase — Enterprise Cloud Platform',
  meta_description TEXT DEFAULT 'Scalable, multi-tenant database, real-time messaging, auth, and cloud storage.',
  meta_keywords TEXT DEFAULT 'syntrabase, firestore, firebase, authentication, postgresql, realtime, cloud storage',
  og_image_url TEXT,
  twitter_card VARCHAR(50) DEFAULT 'summary_large_image',
  primary_color VARCHAR(50) DEFAULT '#3b82f6',
  contact_email VARCHAR(255) DEFAULT 'support@syntrabase.internal',
  copyright_text TEXT DEFAULT '© 2026 Syntrabase Systems Inc. All rights reserved.',
  custom_css TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed authoritative global branding row if absent
INSERT INTO platform_branding (
  id, platform_name, tagline, meta_title, meta_description, meta_keywords,
  twitter_card, primary_color, contact_email, copyright_text, updated_at
) VALUES (
  'global',
  'Syntrabase',
  'Enterprise Cloud Platform & Firebase Alternative',
  'Syntrabase — Enterprise Cloud Platform',
  'Scalable, multi-tenant database, real-time messaging, auth, and cloud storage.',
  'syntrabase, firestore, firebase, authentication, postgresql, realtime, cloud storage',
  'summary_large_image',
  '#3b82f6',
  'support@syntrabase.internal',
  '© 2026 Syntrabase Systems Inc. All rights reserved.',
  NOW()
) ON CONFLICT (id) DO NOTHING;
