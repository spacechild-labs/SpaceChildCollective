/**
 * SpaceChild SEO Engine - Sitemap Generator
 * Generates XML sitemaps for all platforms
 */

import type { SitemapEntry } from './types';
import { getAllPlatformConfigs } from './platform-configs';

export class SitemapGenerator {
  private baseUrl: string;
  private entries: SitemapEntry[] = [];

  constructor(baseUrl: string = 'https://spacechild.love') {
    this.baseUrl = baseUrl;
  }

  /**
   * Add a URL to the sitemap
   */
  addUrl(entry: SitemapEntry): void {
    this.entries.push(entry);
  }

  /**
   * Add multiple URLs to the sitemap
   */
  addUrls(entries: SitemapEntry[]): void {
    this.entries.push(...entries);
  }

  /**
   * Generate sitemap for all platforms
   */
  generatePlatformSitemap(): void {
    const platforms = getAllPlatformConfigs();

    platforms.forEach((platform) => {
      // Main platform page
      this.addUrl({
        url: `${this.baseUrl}/${platform.slug}`,
        lastmod: new Date().toISOString().split('T')[0],
        changefreq: 'weekly',
        priority: 0.9,
      });

      // Platform documentation
      if (platform.docsUrl) {
        this.addUrl({
          url: `${this.baseUrl}/${platform.slug}/docs`,
          lastmod: new Date().toISOString().split('T')[0],
          changefreq: 'weekly',
          priority: 0.8,
        });
      }

      // Platform demo
      if (platform.demoUrl) {
        this.addUrl({
          url: `${this.baseUrl}/${platform.slug}/demo`,
          lastmod: new Date().toISOString().split('T')[0],
          changefreq: 'monthly',
          priority: 0.7,
        });
      }
    });
  }

  /**
   * Generate sitemap for blog/content
   */
  generateContentSitemap(posts: Array<{ slug: string; date: string }>): void {
    posts.forEach((post) => {
      this.addUrl({
        url: `${this.baseUrl}/blog/${post.slug}`,
        lastmod: post.date,
        changefreq: 'monthly',
        priority: 0.6,
      });
    });
  }

  /**
   * Generate sitemap XML
   */
  toXML(): string {
    const urls = this.entries.map((entry) => {
      let xml = `  <url>\n    <loc>${this.escapeXml(entry.url)}</loc>`;

      if (entry.lastmod) {
        xml += `\n    <lastmod>${entry.lastmod}</lastmod>`;
      }

      if (entry.changefreq) {
        xml += `\n    <changefreq>${entry.changefreq}</changefreq>`;
      }

      if (entry.priority !== undefined) {
        xml += `\n    <priority>${entry.priority.toFixed(1)}</priority>`;
      }

      xml += `\n  </url>`;
      return xml;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  }

  /**
   * Generate robots.txt content
   */
  static generateRobotsTxt(baseUrl: string): string {
    return `# SpaceChild Robots.txt
User-agent: *
Allow: /

# Sitemaps
Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-blog.xml

# Fast crawl rate for verified bots
User-agent: Googlebot
Crawl-delay: 0

User-agent: Bingbot
Crawl-delay: 0

# Block bad bots
User-agent: AhrefsBot
Disallow: /

User-agent: SemrushBot
Disallow: /

User-agent: MJ12bot
Disallow: /

User-agent: DotBot
Disallow: /

# Disallow admin/internal paths
Disallow: /api/internal/
Disallow: /admin/
Disallow: /_next/
Disallow: /static/build/
`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length;
  }
}

/**
 * Generate comprehensive sitemap for entire ecosystem
 */
export function generateEcosystemSitemap(): string {
  const generator = new SitemapGenerator();

  // Add main pages
  generator.addUrl({
    url: 'https://spacechild.love',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'daily',
    priority: 1.0,
  });

  generator.addUrl({
    url: 'https://spacechild.love/about',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'monthly',
    priority: 0.8,
  });

  generator.addUrl({
    url: 'https://spacechild.love/blog',
    lastmod: new Date().toISOString().split('T')[0],
    changefreq: 'daily',
    priority: 0.9,
  });

  // Add platform pages
  generator.generatePlatformSitemap();

  return generator.toXML();
}
