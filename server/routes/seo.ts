/**
 * SEO Routes - Dynamic SEO utilities for SpaceChildCollective and SpaceChild ecosystem
 * Enhanced with brand assets, structured data, and social media optimization
 */

import express, { type Request, type Response } from 'express';
import {
  setupPlatformSEO,
  renderPlatformMetaTags,
  generatePlatformOGImage,
  getPlatformConfig,
  getAllPlatformConfigs,
  generateEcosystemSitemap,
  SitemapGenerator,
  BrandAssetsManager,
  StructuredDataGenerator,
  SocialMediaOptimizer,
  type ConsciousnessVerification,
} from '../seo/index.js';
import { storage } from '../storage.js';
import { siteUrl } from '../lib/site-url';

const router = express.Router();

// Initialize managers
const brandAssets = new BrandAssetsManager();
const structuredData = new StructuredDataGenerator();
const socialOptimizer = new SocialMediaOptimizer();

/**
 * GET /api/seo/meta/:platform
 * Get SEO metadata for a platform
 */
router.get('/meta/:platform', (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const {
      path,
      pageTitle,
      pageDescription,
      type,
    } = req.query as {
      path?: string;
      pageTitle?: string;
      pageDescription?: string;
      type?: 'website' | 'article' | 'product';
    };

    const metadata = setupPlatformSEO(platform, {
      path,
      pageTitle,
      pageDescription,
      type,
    });

    if (!metadata) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    res.json(metadata);
  } catch (error) {
    console.error('Error generating meta:', error);
    res.status(500).json({ error: 'Failed to generate metadata' });
  }
});

/**
 * GET /api/seo/meta-tags/:platform
 * Get rendered HTML meta tags for a platform
 */
router.get('/meta-tags/:platform', (req: Request, res: Response) => {
  try {
    const { platform } = req.params;
    const {
      path,
      pageTitle,
      pageDescription,
      type,
    } = req.query as {
      path?: string;
      pageTitle?: string;
      pageDescription?: string;
      type?: 'website' | 'article' | 'product';
    };

    const metaTags = renderPlatformMetaTags(platform, {
      path,
      pageTitle,
      pageDescription,
      type,
    });

    if (!metaTags) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    res.type('html').send(metaTags);
  } catch (error) {
    console.error('Error rendering meta tags:', error);
    res.status(500).json({ error: 'Failed to render meta tags' });
  }
});

/**
 * GET /api/seo/og-image
 * Generate dynamic Open Graph image
 * Query params: platform, name, tagline, category, consciousness, format (html|svg)
 */
router.get('/og-image', (req: Request, res: Response) => {
  try {
    const { platform: platformSlug, format = 'svg' } = req.query as {
      platform?: string;
      format?: 'html' | 'svg';
    };

    if (!platformSlug) {
      return res.status(400).json({ error: 'Platform parameter required' });
    }

    const config = getPlatformConfig(platformSlug);
    if (!config) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    const image = generatePlatformOGImage(config, format);

    if (format === 'html') {
      res.type('html').send(image);
    } else {
      res.type('svg').send(image);
    }
  } catch (error) {
    console.error('Error generating OG image:', error);
    res.status(500).json({ error: 'Failed to generate OG image' });
  }
});

/**
 * GET /api/seo/platforms
 * Get all available platforms
 */
router.get('/platforms', (_req: Request, res: Response) => {
  try {
    const platforms = getAllPlatformConfigs();
    res.json({
      count: platforms.length,
      platforms: platforms.map((p) => ({
        name: p.name,
        slug: p.slug,
        tagline: p.tagline,
        category: p.category,
        consciousnessScore: p.consciousnessScore,
      })),
    });
  } catch (error) {
    console.error('Error getting platforms:', error);
    res.status(500).json({ error: 'Failed to get platforms' });
  }
});

/**
 * GET /api/seo/platform/:slug
 * Get detailed platform configuration
 */
router.get('/platform/:slug', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const config = getPlatformConfig(slug);

    if (!config) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    res.json(config);
  } catch (error) {
    console.error('Error getting platform config:', error);
    res.status(500).json({ error: 'Failed to get platform configuration' });
  }
});

/**
 * GET /sitemap.xml
 * Generate main sitemap
 */
export async function sitemapHandler(_req: Request, res: Response) {
  try {
    const publishedPapers = await storage.getPublishedPapers();
    const sitemap = generateEcosystemSitemap(publishedPapers);
    res.type('application/xml').send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
}

router.get('/sitemap.xml', sitemapHandler);

/**
 * GET /robots.txt
 * Generate robots.txt
 */
export function robotsHandler(_req: Request, res: Response) {
  try {
    const baseUrl = siteUrl();
    const robotsTxt = SitemapGenerator.generateRobotsTxt(baseUrl);
    res.type('text').send(robotsTxt);
  } catch (error) {
    console.error('Error generating robots.txt:', error);
    res.status(500).send('Error generating robots.txt');
  }
}

router.get('/robots.txt', robotsHandler);

/**
 * POST /api/seo/verify-consciousness
 * Add consciousness verification to SEO metadata
 */
router.post('/verify-consciousness', (req: Request, res: Response) => {
  try {
    const { platform, phiValue, verificationHash } = req.body;

    if (!platform || phiValue === undefined) {
      return res.status(400).json({ error: 'Platform and phiValue required' });
    }

    const verification: ConsciousnessVerification = {
      verified: true,
      phiValue: parseFloat(phiValue),
      verificationHash: verificationHash || `0x${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      coherence: phiValue > 0.9 ? 0.95 : 0.85,
    };

    const metadata = setupPlatformSEO(platform, {
      consciousnessVerification: verification,
    });

    if (!metadata) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    res.json({
      success: true,
      verification,
      metadata,
    });
  } catch (error) {
    console.error('Error verifying consciousness:', error);
    res.status(500).json({ error: 'Failed to verify consciousness' });
  }
});

/**
 * GET /api/seo/brand-assets
 * Get complete brand asset links and meta tags
 */
router.get('/brand-assets', (_req: Request, res: Response) => {
  try {
    const faviconTags = brandAssets.generateFaviconTags();
    const appleTags = brandAssets.generateAppleTouchIconTags();
    const manifestLinks = brandAssets.generateManifestLinks();
    const browserConfig = brandAssets.generateBrowserConfig();

    res.json({
      faviconTags,
      appleTags,
      manifestLinks,
      browserConfig,
      assets: {
        favicon: brandAssets.getBrandAssetUrl('favicon'),
        appleTouchIcon: brandAssets.getBrandAssetUrl('apple-touch-icon'),
        androidIcons: [
          brandAssets.getBrandAssetUrl('android-icon', 192),
          brandAssets.getBrandAssetUrl('android-icon', 512),
        ],
        manifest: brandAssets.getBrandAssetUrl('manifest'),
      },
    });
  } catch (error) {
    console.error('Error generating brand assets:', error);
    res.status(500).json({ error: 'Failed to generate brand assets' });
  }
});

/**
 * GET /api/seo/structured-data
 * Get structured data for the platform
 */
router.get('/structured-data', (req: Request, res: Response) => {
  try {
    const { type = 'complete' } = req.query as {
      type?: 'complete' | 'organization' | 'software' | 'website';
    };

    let data: object;
    switch (type) {
      case 'organization':
        data = structuredData.generateOrganizationSchema();
        break;
      case 'software':
        data = structuredData.generateSoftwareApplicationSchema();
        break;
      case 'website':
        data = structuredData.generateWebSiteSchema();
        break;
      case 'complete':
      default:
        // Return array of all structured data
        const organization = structuredData.generateOrganizationSchema();
        const software = structuredData.generateSoftwareApplicationSchema();
        const website = structuredData.generateWebSiteSchema();
        data = { organization, software, website };
        break;
    }

    if (Array.isArray(data)) {
      res.json({ structuredData: data });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error('Error generating structured data:', error);
    res.status(500).json({ error: 'Failed to generate structured data' });
  }
});

/**
 * GET /api/seo/structured-data/breadcrumbs
 * Generate breadcrumb structured data
 */
router.get('/structured-data/breadcrumbs', (req: Request, res: Response) => {
  try {
    const { breadcrumbs } = req.query as {
      breadcrumbs?: string;
    };

    if (!breadcrumbs) {
      return res.status(400).json({ error: 'Breadcrumbs parameter required' });
    }

    const breadcrumbList = JSON.parse(decodeURIComponent(breadcrumbs));
    const schema = structuredData.generateBreadcrumbSchema(breadcrumbList);
    
    res.json(schema);
  } catch (error) {
    console.error('Error generating breadcrumb schema:', error);
    res.status(500).json({ error: 'Failed to generate breadcrumb schema' });
  }
});

/**
 * GET /api/seo/social-tags
 * Get complete social media meta tags
 */
router.get('/social-tags', (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      imageUrl,
      url,
      type,
      twitterCardType,
    } = req.query as {
      title?: string;
      description?: string;
      imageUrl?: string;
      url?: string;
      type?: 'website' | 'article' | 'product';
      twitterCardType?: 'summary' | 'summary_large_image' | 'app' | 'player';
    };

    const socialTags = socialOptimizer.generateCompleteSocialTags({
      title,
      description,
      imageUrl,
      url,
      type,
      twitterCardType,
    });

    res.type('html').send(socialTags);
  } catch (error) {
    console.error('Error generating social tags:', error);
    res.status(500).json({ error: 'Failed to generate social tags' });
  }
});

/**
 * GET /api/seo/social-sharing
 * Get social media sharing URLs
 */
router.get('/social-sharing', (req: Request, res: Response) => {
  try {
    const {
      url = 'https://spacechild.love',
      title = 'SpaceChild Research Collective',
      description = 'Where Human & AI Consciousness Co-Create the Future of Knowledge',
      hashtags,
    } = req.query as {
      url?: string;
      title?: string;
      description?: string;
      hashtags?: string;
    };

    const hashtagArray = hashtags ? hashtags.split(',').map(h => h.trim()) : [
      'AI',
      'Consciousness',
      'Research',
      'Blockchain',
      'DeSci',
    ];

    const sharingUrls = socialOptimizer.generateSharingUrls({
      url,
      title,
      description,
      hashtags: hashtagArray,
    });

    res.json({
      url,
      title,
      description,
      hashtags: hashtagArray,
      sharingUrls,
    });
  } catch (error) {
    console.error('Error generating sharing URLs:', error);
    res.status(500).json({ error: 'Failed to generate sharing URLs' });
  }
});

/**
 * GET /api/seo/social-templates
 * Get social media post templates
 */
router.get('/social-templates', (req: Request, res: Response) => {
  try {
    const templates = socialOptimizer.generatePostTemplates();
    res.json(templates);
  } catch (error) {
    console.error('Error generating post templates:', error);
    res.status(500).json({ error: 'Failed to generate post templates' });
  }
});

/**
 * GET /api/seo/health
 * Health check endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'SpaceChild SEO Engine',
    version: '1.0.0',
    platforms: getAllPlatformConfigs().length,
    timestamp: new Date().toISOString(),
  });
});

export default router;
