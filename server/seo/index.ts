/**
 * SpaceChild SEO Engine - Main Export
 * Universal SEO toolkit for the spacechild.love ecosystem
 * Enhanced with consciousness-aware branding and advanced social media optimization
 */

// Type exports
export type {
  PlatformConfig,
  SEOMetadata,
  OpenGraphData,
  TwitterCardData,
  ConsciousnessVerification,
  StructuredDataOrganization,
  StructuredDataSoftwareApplication,
  StructuredDataArticle,
  SitemapEntry,
} from './types';

// Meta generator
export { MetaGenerator, createMetaGenerator } from './meta-generator';

// Platform configurations
export {
  PLATFORM_CONFIGS,
  getPlatformConfig,
  getAllPlatformConfigs,
  getPlatformsByCategory,
} from './platform-configs';

// Sitemap generator
export {
  SitemapGenerator,
  generateEcosystemSitemap,
} from './sitemap-generator';

// OG image generator
export {
  OGImageGenerator,
  generatePlatformOGImage,
  type OGImageOptions,
} from './og-image-generator';

// Brand assets manager
export {
  BrandAssetsManager,
  getBrandAssetUrl,
  generateFaviconTags,
  generateAppleTouchIconTags,
  generateManifestLinks,
} from './brand-assets';

// Structured data generator
export {
  StructuredDataGenerator,
  generateOrganizationSchema,
  generateSoftwareApplicationSchema,
  generateArticleSchema,
  generateBreadcrumbSchema,
} from './structured-data';

// Social media optimization
export {
  SocialMediaOptimizer,
  generateTwitterCard,
  generateLinkedInCard,
  generateFacebookCard,
} from './social-optimizer';

// Convenience function to get complete SEO setup for a platform
import { createMetaGenerator } from './meta-generator';
import { getPlatformConfig } from './platform-configs';
import type { SEOMetadata, ConsciousnessVerification } from './types';

/**
 * Quick setup function for platform SEO
 */
export function setupPlatformSEO(
  platformSlug: string,
  options: {
    path?: string;
    pageTitle?: string;
    pageDescription?: string;
    consciousnessVerification?: ConsciousnessVerification;
    additionalKeywords?: string[];
    type?: 'website' | 'article' | 'product';
  } = {}
): SEOMetadata | null {
  const config = getPlatformConfig(platformSlug);
  if (!config) {
    console.error(`Platform config not found for slug: ${platformSlug}`);
    return null;
  }

  const generator = createMetaGenerator(config);
  return generator.generateMetadata(options);
}

/**
 * Render SEO meta tags for a platform
 */
export function renderPlatformMetaTags(
  platformSlug: string,
  options: {
    path?: string;
    pageTitle?: string;
    pageDescription?: string;
    consciousnessVerification?: ConsciousnessVerification;
    additionalKeywords?: string[];
    type?: 'website' | 'article' | 'product';
  } = {}
): string | null {
  const config = getPlatformConfig(platformSlug);
  if (!config) {
    return null;
  }

  const generator = createMetaGenerator(config);
  const metadata = generator.generateMetadata(options);
  return generator.renderMetaTags(metadata);
}
