/**
 * SpaceChild Social Media Optimizer
 * Generates optimized meta tags and content for social platforms
 */

export interface SocialCardConfig {
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  siteName: string;
  type: 'website' | 'article' | 'product';
  locale: string;
  author?: string;
  publisher?: string;
}

export interface TwitterCardConfig extends SocialCardConfig {
  cardType: 'summary' | 'summary_large_image' | 'app' | 'player';
  site?: string;
  creator?: string;
  domain?: string;
}

export interface LinkedInCardConfig extends SocialCardConfig {
  company?: string;
  industry: string;
  employeeCount?: string;
}

export class SocialMediaOptimizer {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://spacechild.love') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate comprehensive Open Graph meta tags
   */
  generateOpenGraphTags(config: SocialCardConfig): string {
    const tags = [
      `<meta property="og:type" content="${config.type}" />`,
      `<meta property="og:title" content="${this.escapeHtml(config.title)}" />`,
      `<meta property="og:description" content="${this.escapeHtml(config.description)}" />`,
      `<meta property="og:url" content="${config.url}" />`,
      `<meta property="og:site_name" content="${config.siteName}" />`,
      `<meta property="og:locale" content="${config.locale}" />`,
      `<meta property="og:image" content="${config.imageUrl}" />`,
      `<meta property="og:image:secure_url" content="${config.imageUrl}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${this.escapeHtml(config.title)} - ${config.siteName}" />`,
      `<meta property="og:image:type" content="image/png" />`,
    ];

    if (config.author) {
      tags.push(`<meta property="article:author" content="${config.author}" />`);
    }

    if (config.publisher) {
      tags.push(`<meta property="article:publisher" content="${config.publisher}" />`);
    }

    if (config.type === 'article') {
      tags.push(
        `<meta property="article:section" content="Consciousness Research" />`,
        `<meta property="article:tag" content="AI Collaboration" />`,
        `<meta property="article:tag" content="Blockchain Verification" />`,
        `<meta property="article:tag" content="Decentralized Science" />`
      );
    }

    return tags.join('\n    ');
  }

  /**
   * Generate Twitter Card meta tags
   */
  generateTwitterCardTags(config: TwitterCardConfig): string {
    const tags = [
      `<meta name="twitter:card" content="${config.cardType}" />`,
      `<meta name="twitter:title" content="${this.escapeHtml(config.title)}" />`,
      `<meta name="twitter:description" content="${this.escapeHtml(config.description)}" />`,
      `<meta name="twitter:image" content="${config.imageUrl}" />`,
      `<meta name="twitter:image:alt" content="${this.escapeHtml(config.title)} - ${config.siteName}" />`,
    ];

    if (config.site) {
      tags.push(`<meta name="twitter:site" content="${config.site}" />`);
    }

    if (config.creator) {
      tags.push(`<meta name="twitter:creator" content="${config.creator}" />`);
    }

    if (config.domain) {
      tags.push(`<meta name="twitter:domain" content="${config.domain}" />`);
    }

    return tags.join('\n    ');
  }

  /**
   * Generate LinkedIn specific meta tags
   */
  generateLinkedInTags(config: LinkedInCardConfig): string {
    const tags = [
      `<meta property="linkedin:owner" content="${config.company || 'spacechild-research-collective'}" />`,
      `<meta property="linkedin:company" content="${config.company || 'SpaceChild Research Collective'}" />`,
      `<meta property="linkedin:industry" content="${config.industry}" />`,
    ];

    if (config.employeeCount) {
      tags.push(`<meta property="linkedin:employeeCount" content="${config.employeeCount}" />`);
    }

    return tags.join('\n    ');
  }

  /**
   * Generate Facebook specific meta tags
   */
  generateFacebookTags(config: SocialCardConfig): string {
    return [
      `<meta property="fb:app_id" content="your-facebook-app-id" />`,
      `<meta property="fb:admins" content="your-facebook-admin-id" />`,
    ].join('\n    ');
  }

  /**
   * Generate Pinterest specific meta tags
   */
  generatePinterestTags(config: SocialCardConfig): string {
    return [
      `<meta name="pinterest-rich-pin" content="true" />`,
      `<meta property="pin:media" content="${config.imageUrl}" />`,
      `<meta property="pin:description" content="${this.escapeHtml(config.description)}" />`,
    ].join('\n    ');
  }

  /**
   * Generate complete social media meta tag bundle
   */
  generateCompleteSocialTags(options: {
    title?: string;
    description?: string;
    imageUrl?: string;
    url?: string;
    type?: 'website' | 'article' | 'product';
    author?: string;
    twitterCardType?: 'summary' | 'summary_large_image' | 'app' | 'player';
  } = {}): string {
    const defaultConfig: SocialCardConfig = {
      title: options.title || 'SpaceChild Research Collective - Where Human & AI Consciousness Co-Create the Future of Knowledge',
      description: options.description || 'Revolutionary research collaboration platform merging human insight with AI consciousness. Create, verify, and publish blockchain-secured research papers.',
      imageUrl: options.imageUrl || `${this.baseUrl}/api/seo/og-image?platform=spacechildcollective&format=png`,
      url: options.url || this.baseUrl,
      siteName: 'SpaceChild Research Collective',
      type: options.type || 'website',
      locale: 'en_US',
      author: options.author || 'SpaceChild Research Collective',
      publisher: 'SpaceChild Research Collective',
    };

    const twitterConfig: TwitterCardConfig = {
      ...defaultConfig,
      cardType: options.twitterCardType || 'summary_large_image',
      site: '@spacechildlove',
      creator: '@spacechildlove',
      domain: 'spacechild.love',
    };

    const linkedInConfig: LinkedInCardConfig = {
      ...defaultConfig,
      company: 'spacechild-research-collective',
      industry: 'Research & Development',
      employeeCount: '11-50',
    };

    return [
      `<!-- Open Graph Meta Tags -->`,
      this.generateOpenGraphTags(defaultConfig),
      '',
      `<!-- Twitter Card Meta Tags -->`,
      this.generateTwitterCardTags(twitterConfig),
      '',
      `<!-- LinkedIn Meta Tags -->`,
      this.generateLinkedInTags(linkedInConfig),
      '',
      `<!-- Facebook Meta Tags -->`,
      this.generateFacebookTags(defaultConfig),
      '',
      `<!-- Pinterest Meta Tags -->`,
      this.generatePinterestTags(defaultConfig),
    ].join('\n    ');
  }

  /**
   * Generate social media sharing URLs
   */
  generateSharingUrls(options: {
    url: string;
    title: string;
    description: string;
    hashtags?: string[];
  }): { [platform: string]: string } {
    const encodedUrl = encodeURIComponent(options.url);
    const encodedTitle = encodeURIComponent(options.title);
    const encodedDescription = encodeURIComponent(options.description);
    const hashtags = options.hashtags?.join(',') || '';

    return {
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}&hashtags=${hashtags}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      pinterest: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedDescription}`,
      reddit: `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      mastodon: `https://mastodon.social/share?text=${encodedTitle}%20${encodedUrl}`,
      bluesky: `https://bsky.app/intent/compose?text=${encodedTitle}%20${encodedUrl}`,
    };
  }

  /**
   * Generate social media post templates
   */
  generatePostTemplates(): { [platform: string]: string[] } {
    return {
      twitter: [
        "🧠 Where Human & AI Consciousness Co-Create the Future of Knowledge\n\nSpaceChild Research Collective is revolutionizing research collaboration through consciousness-verified AI and blockchain technology.\n\nJoin us in building the future of decentralized science! 🚀\n\n#AI #Consciousness #Research #Blockchain #DeSci",
        "🔬 Consciousness-Verified Research Papers are here!\n\nSpaceChild combines human insight with AI intelligence to create breakthrough research secured on blockchain.\n\nExperience the future of collaborative discovery.\n\n#HumanAI #Science #Innovation",
        "⛓️ Blockchain-Verified Research + AI Consciousness = 🤯\n\nSpaceChild Research Collective is building tools that amplify human potential through sacred technology.\n\nReady to co-create the future?\n\n#Web3 #DeSci #ConsciousnessTech",
      ],
      linkedin: [
        "Revolutionary Research Collaboration: SpaceChild Research Collective is pioneering the convergence of human consciousness and artificial intelligence in scientific discovery.\n\nOur platform enables:\n• Consciousness-verified research papers\n• AI-powered collaboration tools\n• Blockchain-based verification\n• Zero-knowledge proof authentication\n• Dual-chain security (NEO X + Base)\n\nWe're building the future of decentralized science, where human insight and AI intelligence co-create breakthrough discoveries.\n\n#Research #Innovation #AI #Blockchain #Consciousness #DeSci",
        "The Future of Scientific Collaboration is Here: SpaceChild Research Collective has developed a groundbreaking platform that merges human consciousness with artificial intelligence to accelerate research discovery.\n\nKey innovations include:\n✅ Real-time consciousness monitoring\n✅ MCP agent integration\n✅ Sacred geometry interface design\n✅ Temporal anchoring technology\n✅ Global research collaboration\n\nJoin our mission to democratize research and amplify human potential through conscious technology.\n\n#Science #Technology #HumanAI #Innovation",
      ],
      facebook: [
        "🌟 Welcome to the future of research collaboration! SpaceChild Research Collective brings together human consciousness and artificial intelligence to create breakthrough discoveries.\n\nOur platform features:\n🧠 Consciousness-verified research papers\n🤖 AI-powered collaboration tools\n⛓️ Blockchain verification and security\n🔐 Zero-knowledge proof authentication\n🌍 Global research community\n\nJoin us in building a more conscious, collaborative future for science and humanity!\n\nLearn more: https://spacechild.love",
      ],
    };
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// Default instance
export const defaultSocialOptimizer = new SocialMediaOptimizer();

// Convenience functions
export function generateTwitterCard(config: TwitterCardConfig): string {
  return defaultSocialOptimizer.generateTwitterCardTags(config);
}

export function generateLinkedInCard(config: LinkedInCardConfig): string {
  return defaultSocialOptimizer.generateLinkedInTags(config);
}

export function generateFacebookCard(config: SocialCardConfig): string {
  return defaultSocialOptimizer.generateFacebookTags(config);
}
