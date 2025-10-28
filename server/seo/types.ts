/**
 * SpaceChild SEO Engine - Type Definitions
 * Universal SEO types for the spacechild.love ecosystem
 */

export interface PlatformConfig {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: 'ai' | 'quantum' | 'blockchain' | 'industrial' | 'consciousness' | 'defi' | 'tools';
  consciousnessScore?: number;
  keywords: string[];
  features: string[];
  techStack: string[];
  githubUrl?: string;
  docsUrl?: string;
  demoUrl?: string;
}

export interface SEOMetadata {
  title: string;
  description: string;
  keywords: string;
  canonical?: string;
  robots?: string;
  author?: string;
  openGraph: OpenGraphData;
  twitter: TwitterCardData;
  jsonLd: any;
  consciousnessVerification?: ConsciousnessVerification;
}

export interface OpenGraphData {
  type: 'website' | 'article' | 'product';
  title: string;
  description: string;
  url: string;
  image: string;
  imageAlt: string;
  siteName: string;
  locale?: string;
}

export interface TwitterCardData {
  card: 'summary' | 'summary_large_image' | 'app' | 'player';
  site?: string;
  creator?: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}

export interface ConsciousnessVerification {
  verified: boolean;
  phiValue: number;
  verificationHash: string;
  timestamp: string;
  coherence?: number;
}

export interface StructuredDataOrganization {
  '@context': string;
  '@type': 'Organization';
  name: string;
  url: string;
  logo: string;
  description: string;
  sameAs?: string[];
  contactPoint?: {
    '@type': 'ContactPoint';
    email: string;
    contactType: string;
  };
}

export interface StructuredDataSoftwareApplication {
  '@context': string;
  '@type': 'SoftwareApplication';
  name: string;
  applicationCategory: string;
  operatingSystem?: string;
  offers?: {
    '@type': 'Offer';
    price: string;
    priceCurrency: string;
  };
  aggregateRating?: {
    '@type': 'AggregateRating';
    ratingValue: string;
    reviewCount: string;
  };
}

export interface StructuredDataArticle {
  '@context': string;
  '@type': 'TechArticle' | 'Article';
  headline: string;
  description: string;
  author: {
    '@type': 'Organization' | 'Person';
    name: string;
  };
  datePublished?: string;
  dateModified?: string;
  image?: string;
}

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}
