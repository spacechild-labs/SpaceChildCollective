/**
 * SEO Routes - Dynamic SEO utilities for SpaceChildCollective and SpaceChild ecosystem
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
  type ConsciousnessVerification,
} from '../seo/index.js';

const router = express.Router();

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
router.get('/sitemap.xml', (_req: Request, res: Response) => {
  try {
    const sitemap = generateEcosystemSitemap();
    res.type('xml').send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
});

/**
 * GET /robots.txt
 * Generate robots.txt
 */
router.get('/robots.txt', (_req: Request, res: Response) => {
  try {
    const baseUrl = process.env.BASE_URL || 'https://spacechild.love';
    const robotsTxt = SitemapGenerator.generateRobotsTxt(baseUrl);
    res.type('text').send(robotsTxt);
  } catch (error) {
    console.error('Error generating robots.txt:', error);
    res.status(500).send('Error generating robots.txt');
  }
});

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
