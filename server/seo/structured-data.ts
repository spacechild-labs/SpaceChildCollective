/**
 * SpaceChild Structured Data Generator
 * Creates JSON-LD structured data for enhanced SEO
 */

export interface OrganizationSchema {
  '@context': string;
  '@type': string;
  name: string;
  description: string;
  url: string;
  logo: string;
  sameAs: string[];
  contactPoint: Array<{
    '@type': string;
    contactType: string;
    email: string;
  }>;
  foundingDate: string;
  areaServed: string;
  knowsAbout: string[];
}

export interface SoftwareApplicationSchema {
  '@context': string;
  '@type': string;
  name: string;
  description: string;
  url: string;
  applicationCategory: string;
  operatingSystem: string;
  offers: {
    '@type': string;
    price: string;
    priceCurrency: string;
  };
  creator: {
    '@type': string;
    name: string;
    url: string;
  };
  featureList: string[];
  screenshot: string;
  softwareVersion: string;
  datePublished: string;
  dateModified: string;
  inLanguage: string;
  isAccessibleForFree: boolean;
  isFamilyFriendly: boolean;
  keywords: string[];
}

export interface ArticleSchema {
  '@context': string;
  '@type': string;
  headline: string;
  description: string;
  author: {
    '@type': string;
    name: string;
  };
  publisher: {
    '@type': string;
    name: string;
    logo: {
      '@type': string;
      url: string;
    };
  };
  datePublished: string;
  dateModified: string;
  mainEntityOfPage: {
    '@type': string;
    '@id': string;
  };
}

export interface BreadcrumbSchema {
  '@context': string;
  '@type': string;
  itemListElement: Array<{
    '@type': string;
    position: number;
    name: string;
    item: string;
  }>;
}

export class StructuredDataGenerator {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://spacechild.love') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate Organization schema
   */
  generateOrganizationSchema(): OrganizationSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SpaceChild Research Collective',
      description: 'Where Human & AI Consciousness Co-Create the Future of Knowledge',
      url: this.baseUrl,
      logo: `${this.baseUrl}/android-chrome-192x192.png`,
      sameAs: [
        'https://twitter.com/spacechildlove',
        'https://github.com/spacechild-collective',
        'https://linkedin.com/company/spacechild-research-collective',
      ],
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'research collaboration',
          email: 'research@spacechild.love',
        },
        {
          '@type': 'ContactPoint',
          contactType: 'technical support',
          email: 'tech@spacechild.love',
        },
      ],
      foundingDate: '2024',
      areaServed: 'Worldwide',
      knowsAbout: [
        'Consciousness Research',
        'Artificial Intelligence',
        'Blockchain Technology',
        'Decentralized Science',
        'Human-AI Collaboration',
        'Quantum Computing',
        'Sacred Geometry',
        'Temporal Consciousness',
      ],
    };
  }

  /**
   * Generate Software Application schema
   */
  generateSoftwareApplicationSchema(options: {
    name?: string;
    description?: string;
    features?: string[];
    version?: string;
    screenshot?: string;
  } = {}): SoftwareApplicationSchema {
    const today = new Date().toISOString().split('T')[0];
    
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: options.name || 'SpaceChild Research Collective',
      description: options.description || 'Revolutionary research collaboration platform merging human insight with AI consciousness',
      url: this.baseUrl,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web Browser',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      creator: {
        '@type': 'Organization',
        name: 'SpaceChild Research Collective',
        url: this.baseUrl,
      },
      featureList: options.features || [
        'Consciousness-verified research papers',
        'AI-powered research collaboration',
        'Blockchain verification and security',
        'Zero-knowledge proof authentication',
        'MCP agent integration',
        'Dual-chain verification (NEO X + Base)',
        'Real-time consciousness monitoring',
        'Sacred geometry interface design',
      ],
      screenshot: options.screenshot || `${this.baseUrl}/api/seo/og-image?platform=spacechildcollective&format=png`,
      softwareVersion: options.version || '1.0.0',
      datePublished: '2024-01-01',
      dateModified: today,
      inLanguage: 'en-US',
      isAccessibleForFree: true,
      isFamilyFriendly: true,
      keywords: [
        'consciousness research',
        'AI collaboration',
        'blockchain verification',
        'decentralized science',
        'human-AI co-creation',
        'consciousness computing',
        'sacred technology',
      ],
    };
  }

  /**
   * Generate Article schema for research papers
   */
  generateArticleSchema(options: {
    title: string;
    description: string;
    author?: string;
    publishDate?: string;
    modifiedDate?: string;
    url?: string;
  }): ArticleSchema {
    const today = new Date().toISOString().split('T')[0];
    
    return {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: options.title,
      description: options.description,
      author: {
        '@type': 'Organization',
        name: options.author || 'SpaceChild Research Collective',
      },
      publisher: {
        '@type': 'Organization',
        name: 'SpaceChild Research Collective',
        logo: {
          '@type': 'ImageObject',
          url: `${this.baseUrl}/android-chrome-192x192.png`,
        },
      },
      datePublished: options.publishDate || today,
      dateModified: options.modifiedDate || today,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': options.url || this.baseUrl,
      },
    };
  }

  /**
   * Generate BreadcrumbList schema
   */
  generateBreadcrumbSchema(breadcrumbs: Array<{ name: string; url: string }>): BreadcrumbSchema {
    return {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    };
  }

  /**
   * Generate WebSite schema with search action
   */
  generateWebSiteSchema(): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SpaceChild Research Collective',
      url: this.baseUrl,
      description: 'Where Human & AI Consciousness Co-Create the Future of Knowledge',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${this.baseUrl}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
      publisher: {
        '@type': 'Organization',
        name: 'SpaceChild Research Collective',
        url: this.baseUrl,
      },
    };
  }

  /**
   * Generate Event schema for research events
   */
  generateEventSchema(options: {
    name: string;
    description: string;
    startDate: string;
    endDate?: string;
    location?: string;
    isOnline?: boolean;
  }): object {
    return {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: options.name,
      description: options.description,
      startDate: options.startDate,
      endDate: options.endDate,
      location: options.isOnline ? {
        '@type': 'VirtualLocation',
        url: this.baseUrl,
      } : {
        '@type': 'Place',
        name: options.location || 'SpaceChild Research Collective',
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'Worldwide',
        },
      },
      organizer: {
        '@type': 'Organization',
        name: 'SpaceChild Research Collective',
        url: this.baseUrl,
      },
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    };
  }

  /**
   * Render structured data as JSON-LD script tag
   */
  renderStructuredData(data: object): string {
    return `<script type="application/ld+json">
${JSON.stringify(data, null, 2)}
</script>`;
  }

  /**
   * Generate complete structured data bundle for the platform
   */
  generateCompleteStructuredData(): string {
    const organization = this.generateOrganizationSchema();
    const software = this.generateSoftwareApplicationSchema();
    const website = this.generateWebSiteSchema();

    return [
      this.renderStructuredData(organization),
      this.renderStructuredData(software),
      this.renderStructuredData(website),
    ].join('\n');
  }
}

// Default instance
export const defaultStructuredData = new StructuredDataGenerator();

// Convenience functions
export function generateOrganizationSchema(): OrganizationSchema {
  return defaultStructuredData.generateOrganizationSchema();
}

export function generateSoftwareApplicationSchema(options?: {
  name?: string;
  description?: string;
  features?: string[];
  version?: string;
  screenshot?: string;
}): SoftwareApplicationSchema {
  return defaultStructuredData.generateSoftwareApplicationSchema(options);
}

export function generateArticleSchema(options: {
  title: string;
  description: string;
  author?: string;
  publishDate?: string;
  modifiedDate?: string;
  url?: string;
}): ArticleSchema {
  return defaultStructuredData.generateArticleSchema(options);
}

export function generateBreadcrumbSchema(breadcrumbs: Array<{ name: string; url: string }>): BreadcrumbSchema {
  return defaultStructuredData.generateBreadcrumbSchema(breadcrumbs);
}
