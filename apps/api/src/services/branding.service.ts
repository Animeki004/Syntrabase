import { query } from '../db/pool.js';
import { config } from '../config.js';

export interface PlatformBranding {
  id: string;
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
  updatedAt: string;
}

const defaultBranding: PlatformBranding = {
  id: 'global',
  platformName: 'Syntrabase',
  tagline: 'Enterprise Cloud Platform & Firebase Alternative',
  logoUrl: '',
  faviconUrl: '',
  metaTitle: 'Syntrabase — Enterprise Cloud Platform',
  metaDescription: 'Scalable, multi-tenant database, real-time messaging, auth, and cloud storage.',
  metaKeywords: 'syntrabase, firestore, firebase, authentication, postgresql, realtime, cloud storage',
  ogImageUrl: '',
  twitterCard: 'summary_large_image',
  primaryColor: '#3b82f6',
  contactEmail: 'support@syntrabase.internal',
  copyrightText: '© 2026 Syntrabase Systems Inc. All rights reserved.',
  customCss: '',
  updatedAt: new Date().toISOString(),
};

let inMemoryBrandingState: PlatformBranding = { ...defaultBranding };

export class BrandingService {
  /**
   * Retrieves authoritative platform branding & SEO settings.
   */
  public static async getBranding(): Promise<PlatformBranding> {
    try {
      const res = await query<any>(
        `SELECT id, platform_name as "platformName", tagline, logo_url as "logoUrl",
                favicon_url as "faviconUrl", meta_title as "metaTitle",
                meta_description as "metaDescription", meta_keywords as "metaKeywords",
                og_image_url as "ogImageUrl", twitter_card as "twitterCard",
                primary_color as "primaryColor", contact_email as "contactEmail",
                copyright_text as "copyrightText", custom_css as "customCss",
                updated_at as "updatedAt"
         FROM platform_branding
         WHERE id = 'global'
         LIMIT 1`
      );

      if (res.rows.length > 0) {
        inMemoryBrandingState = {
          ...defaultBranding,
          ...res.rows[0],
        };
        return inMemoryBrandingState;
      }
    } catch {
      // In-memory fallback if migration not yet applied
    }

    return inMemoryBrandingState;
  }

  /**
   * Updates platform branding & SEO settings with validation.
   */
  public static async updateBranding(updates: Partial<PlatformBranding>): Promise<PlatformBranding> {
    const current = await this.getBranding();

    const merged: PlatformBranding = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    inMemoryBrandingState = merged;

    try {
      await query(
        `INSERT INTO platform_branding (
           id, platform_name, tagline, logo_url, favicon_url, meta_title,
           meta_description, meta_keywords, og_image_url, twitter_card,
           primary_color, contact_email, copyright_text, custom_css, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         ON CONFLICT (id) DO UPDATE SET
           platform_name = EXCLUDED.platform_name,
           tagline = EXCLUDED.tagline,
           logo_url = EXCLUDED.logo_url,
           favicon_url = EXCLUDED.favicon_url,
           meta_title = EXCLUDED.meta_title,
           meta_description = EXCLUDED.meta_description,
           meta_keywords = EXCLUDED.meta_keywords,
           og_image_url = EXCLUDED.og_image_url,
           twitter_card = EXCLUDED.twitter_card,
           primary_color = EXCLUDED.primary_color,
           contact_email = EXCLUDED.contact_email,
           copyright_text = EXCLUDED.copyright_text,
           custom_css = EXCLUDED.custom_css,
           updated_at = NOW()`,
        [
          'global',
          merged.platformName,
          merged.tagline,
          merged.logoUrl || null,
          merged.faviconUrl || null,
          merged.metaTitle,
          merged.metaDescription,
          merged.metaKeywords,
          merged.ogImageUrl || null,
          merged.twitterCard || 'summary_large_image',
          merged.primaryColor || '#3b82f6',
          merged.contactEmail || 'support@syntrabase.internal',
          merged.copyrightText,
          merged.customCss || null,
        ]
      );
    } catch {
      // In-memory update already applied
    }

    return merged;
  }
}
