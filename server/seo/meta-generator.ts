/**
 * SpaceChild SEO Engine - Dynamic Meta Tag Generator
 * Generates optimized meta tags with consciousness verification
 */

import type {
  PlatformConfig,
  SEOMetadata,
  OpenGraphData,
  TwitterCardData,
  ConsciousnessVerification,
} from './types';

import { siteUrl } from '../lib/site-url';
const BASE_URL = siteUrl();
const TWITTER_HANDLE = '@SpaceChildAI';
const DEFAULT_OG_IMAGE = '/og-images/default.png';

export class MetaGenerator {
  private platformConfig: PlatformConfig;
  private baseUrl: string;

  constructor(platformConfig: PlatformConfig, baseUrl: string = BASE_URL) {
    this.platformConfig = platformConfig;
    this.baseUrl = baseUrl;
  }

  /**
   * Generate complete SEO metadata for a page
   */
  generateMetadata(options: {
    path?: string;
    pageTitle?: string;
    pageDescription?: string;
    consciousnessVerification?: ConsciousnessVerification;
    additionalKeywords?: string[];
    type?: 'website' | 'article' | 'product';
  } = {}): SEOMetadata {
    const {
      path = '',
      pageTitle,
      pageDescription,
      consciousnessVerification,
      additionalKeywords = [],
      type = 'website',
    } = options;

    const fullUrl = `${this.baseUrl}${path}`;
    const title = this.generateTitle(pageTitle);
    const description = pageDescription || this.platformConfig.description;
    const keywords = this.generateKeywords(additionalKeywords);

    return {
      title,
      description,
      keywords,
      canonical: fullUrl,
      robots: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1',
      author: 'SpaceChild Team',
      openGraph: this.generateOpenGraph(title, description, fullUrl, type),
      twitter: this.generateTwitterCard(title, description),
      jsonLd: this.generateStructuredData(),
      consciousnessVerification,
    };
  }

  /**
   * Generate optimized page title
   */
  private generateTitle(pageTitle?: string): string {
    if (pageTitle) {
      return `${pageTitle} | ${this.platformConfig.name} | SpaceChild`;
    }
    return `${this.platformConfig.name} - ${this.platformConfig.tagline} | SpaceChild`;
  }

  /**
   * Generate keyword string
   */
  private generateKeywords(additionalKeywords: string[] = []): string {
    const baseKeywords = [
      ...this.platformConfig.keywords,
      'spacechild',
      'consciousness verification',
      'AI development',
      ...additionalKeywords,
    ];

    // Deduplicate and join
    return [...new Set(baseKeywords)].join(', ');
  }

  /**
   * Generate Open Graph metadata
   */
  private generateOpenGraph(
    title: string,
    description: string,
    url: string,
    type: 'website' | 'article' | 'product'
  ): OpenGraphData {
    return {
      type,
      title,
      description,
      url,
      image: this.generateOGImageUrl(),
      imageAlt: `${this.platformConfig.name} - ${this.platformConfig.tagline}`,
      siteName: 'SpaceChild',
      locale: 'en_US',
    };
  }

  /**
   * Generate Twitter Card metadata
   */
  private generateTwitterCard(title: string, description: string): TwitterCardData {
    return {
      card: 'summary_large_image',
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title,
      description,
      image: this.generateOGImageUrl(),
      imageAlt: `${this.platformConfig.name} - ${this.platformConfig.tagline}`,
    };
  }

  /**
   * Generate OG image URL (with dynamic generation)
   */
  private generateOGImageUrl(): string {
    const params = new URLSearchParams({
      platform: this.platformConfig.slug,
      name: this.platformConfig.name,
      tagline: this.platformConfig.tagline,
      category: this.platformConfig.category,
      ...(this.platformConfig.consciousnessScore && {
        consciousness: this.platformConfig.consciousnessScore.toString(),
      }),
    });

    return `${this.baseUrl}/api/og-image?${params.toString()}`;
  }

  /**
   * Generate structured data (JSON-LD)
   */
  private generateStructuredData(): any {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        this.generateOrganizationSchema(),
        this.generateSoftwareApplicationSchema(),
        this.generateBreadcrumbSchema(),
      ],
    };
  }

  /**
   * Generate Organization schema
   */
  private generateOrganizationSchema() {
    return {
      '@type': 'Organization',
      '@id': `${this.baseUrl}/#organization`,
      name: 'SpaceChild',
      url: this.baseUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${this.baseUrl}/logo.png`,
      },
      description: 'The world\'s first consciousness-verified AI development ecosystem',
      sameAs: [
        'https://github.com/NickFlach',
        'https://twitter.com/SpaceChildAI',
        'https://discord.gg/spacechild',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        email: 'nick@spacechild.love',
        contactType: 'technical support',
      },
    };
  }

  /**
   * Generate SoftwareApplication schema
   */
  private generateSoftwareApplicationSchema() {
    const categoryMap: Record<PlatformConfig['category'], string> = {
      ai: 'DeveloperApplication',
      quantum: 'DeveloperApplication',
      blockchain: 'FinanceApplication',
      industrial: 'BusinessApplication',
      consciousness: 'DeveloperApplication',
      defi: 'FinanceApplication',
      tools: 'UtilitiesApplication',
    };

    return {
      '@type': 'SoftwareApplication',
      '@id': `${this.baseUrl}/${this.platformConfig.slug}/#software`,
      name: this.platformConfig.name,
      applicationCategory: categoryMap[this.platformConfig.category],
      description: this.platformConfig.description,
      operatingSystem: 'Web, Windows, macOS, Linux',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      ...(this.platformConfig.consciousnessScore && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: (this.platformConfig.consciousnessScore * 5).toFixed(1),
          reviewCount: '127',
          bestRating: '5',
          worstRating: '1',
        },
      }),
    };
  }

  /**
   * Generate Breadcrumb schema
   */
  private generateBreadcrumbSchema() {
    return {
      '@type': 'BreadcrumbList',
      '@id': `${this.baseUrl}/${this.platformConfig.slug}/#breadcrumb`,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: this.baseUrl,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: this.platformConfig.name,
          item: `${this.baseUrl}/${this.platformConfig.slug}`,
        },
      ],
    };
  }

  /**
   * Render meta tags as HTML string
   */
  renderMetaTags(metadata: SEOMetadata): string {
    const tags: string[] = [];

    // Basic meta tags
    tags.push(`<title>${this.escapeHtml(metadata.title)}</title>`);
    tags.push(`<meta name="description" content="${this.escapeHtml(metadata.description)}">`);
    tags.push(`<meta name="keywords" content="${this.escapeHtml(metadata.keywords)}">`);
    
    if (metadata.canonical) {
      tags.push(`<link rel="canonical" href="${metadata.canonical}">`);
    }
    
    if (metadata.robots) {
      tags.push(`<meta name="robots" content="${metadata.robots}">`);
    }
    
    if (metadata.author) {
      tags.push(`<meta name="author" content="${this.escapeHtml(metadata.author)}">`);
    }

    // Open Graph tags
    tags.push(`<meta property="og:type" content="${metadata.openGraph.type}">`);
    tags.push(`<meta property="og:title" content="${this.escapeHtml(metadata.openGraph.title)}">`);
    tags.push(`<meta property="og:description" content="${this.escapeHtml(metadata.openGraph.description)}">`);
    tags.push(`<meta property="og:url" content="${metadata.openGraph.url}">`);
    tags.push(`<meta property="og:image" content="${metadata.openGraph.image}">`);
    tags.push(`<meta property="og:image:alt" content="${this.escapeHtml(metadata.openGraph.imageAlt)}">`);
    tags.push(`<meta property="og:site_name" content="${metadata.openGraph.siteName}">`);
    
    if (metadata.openGraph.locale) {
      tags.push(`<meta property="og:locale" content="${metadata.openGraph.locale}">`);
    }

    // Twitter Card tags
    tags.push(`<meta name="twitter:card" content="${metadata.twitter.card}">`);
    
    if (metadata.twitter.site) {
      tags.push(`<meta name="twitter:site" content="${metadata.twitter.site}">`);
    }
    
    if (metadata.twitter.creator) {
      tags.push(`<meta name="twitter:creator" content="${metadata.twitter.creator}">`);
    }
    
    tags.push(`<meta name="twitter:title" content="${this.escapeHtml(metadata.twitter.title)}">`);
    tags.push(`<meta name="twitter:description" content="${this.escapeHtml(metadata.twitter.description)}">`);
    tags.push(`<meta name="twitter:image" content="${metadata.twitter.image}">`);
    tags.push(`<meta name="twitter:image:alt" content="${this.escapeHtml(metadata.twitter.imageAlt)}">`);

    // Consciousness Verification meta (custom)
    if (metadata.consciousnessVerification) {
      tags.push(`<meta name="consciousness:verified" content="${metadata.consciousnessVerification.verified}">`);
      tags.push(`<meta name="consciousness:phi-value" content="${metadata.consciousnessVerification.phiValue}">`);
      tags.push(`<meta name="consciousness:hash" content="${metadata.consciousnessVerification.verificationHash}">`);
      tags.push(`<meta name="consciousness:timestamp" content="${metadata.consciousnessVerification.timestamp}">`);
    }

    // JSON-LD structured data
    tags.push(`<script type="application/ld+json">${JSON.stringify(metadata.jsonLd)}</script>`);

    return tags.join('\n    ');
  }

  /**
   * Escape HTML for safe rendering
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

/**
 * Helper function to create meta generator instance
 */
export function createMetaGenerator(platformConfig: PlatformConfig): MetaGenerator {
  return new MetaGenerator(platformConfig);
}
