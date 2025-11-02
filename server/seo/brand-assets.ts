/**
 * SpaceChild Brand Assets Manager
 * Handles favicon generation, app icons, and brand asset URLs
 */

export interface BrandAssetConfig {
  baseUrl: string;
  faviconPath: string;
  appleTouchIconPath: string;
  androidIcons: Array<{ size: number; path: string }>;
  manifestPath: string;
  themeColor: string;
}

export class BrandAssetsManager {
  private config: BrandAssetConfig;

  constructor(config: Partial<BrandAssetConfig> = {}) {
    this.config = {
      baseUrl: 'https://spacechild.love',
      faviconPath: '/favicon.svg',
      appleTouchIconPath: '/apple-touch-icon.png',
      androidIcons: [
        { size: 192, path: '/android-chrome-192x192.png' },
        { size: 512, path: '/android-chrome-512x512.png' },
      ],
      manifestPath: '/site.webmanifest',
      themeColor: '#667eea',
      ...config,
    };
  }

  /**
   * Generate complete favicon link tags
   */
  generateFaviconTags(): string {
    const tags = [
      `<link rel="icon" type="image/svg+xml" href="${this.config.baseUrl}${this.config.faviconPath}" />`,
      `<link rel="icon" type="image/png" href="${this.config.baseUrl}/favicon-16x16.png" sizes="16x16" />`,
      `<link rel="icon" type="image/png" href="${this.config.baseUrl}/favicon-32x32.png" sizes="32x32" />`,
      `<link rel="apple-touch-icon" href="${this.config.baseUrl}${this.config.appleTouchIconPath}" sizes="180x180" />`,
      ...this.config.androidIcons.map(icon => 
        `<link rel="icon" type="image/png" href="${this.config.baseUrl}${icon.path}" sizes="${icon.size}x${icon.size}" />`
      ),
      `<link rel="manifest" href="${this.config.baseUrl}${this.config.manifestPath}" />`,
      `<link rel="mask-icon" href="${this.config.baseUrl}${this.config.faviconPath}" color="${this.config.themeColor}" />`,
      `<meta name="msapplication-TileColor" content="${this.config.themeColor}" />`,
      `<meta name="theme-color" content="${this.config.themeColor}" />`,
    ];

    return tags.join('\n    ');
  }

  /**
   * Generate Apple-specific meta tags
   */
  generateAppleTouchIconTags(): string {
    return [
      `<meta name="apple-mobile-web-app-title" content="SpaceChild" />`,
      `<meta name="apple-mobile-web-app-capable" content="yes" />`,
      `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`,
      `<meta name="mobile-web-app-capable" content="yes" />`,
    ].join('\n    ');
  }

  /**
   * Generate PWA manifest links
   */
  generateManifestLinks(): string {
    return [
      `<link rel="manifest" href="${this.config.baseUrl}${this.config.manifestPath}" />`,
      `<meta name="application-name" content="SpaceChild" />`,
    ].join('\n    ');
  }

  /**
   * Get brand asset URL by type
   */
  getBrandAssetUrl(type: 'favicon' | 'apple-touch-icon' | 'android-icon' | 'manifest', size?: number): string {
    switch (type) {
      case 'favicon':
        return `${this.config.baseUrl}${this.config.faviconPath}`;
      case 'apple-touch-icon':
        return `${this.config.baseUrl}${this.config.appleTouchIconPath}`;
      case 'android-icon':
        if (size) {
          const icon = this.config.androidIcons.find(i => i.size === size);
          return icon ? `${this.config.baseUrl}${icon.path}` : `${this.config.baseUrl}/android-chrome-192x192.png`;
        }
        return `${this.config.baseUrl}${this.config.androidIcons[0].path}`;
      case 'manifest':
        return `${this.config.baseUrl}${this.config.manifestPath}`;
      default:
        return `${this.config.baseUrl}${this.config.faviconPath}`;
    }
  }

  /**
   * Generate browserconfig.xml content
   */
  generateBrowserConfig(): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
    <msapplication>
        <tile>
            <square70x70logo src="${this.config.baseUrl}/favicon-32x32.png"/>
            <square150x150logo src="${this.config.baseUrl}${this.config.appleTouchIconPath}"/>
            <square310x310logo src="${this.config.baseUrl}/android-chrome-192x192.png"/>
            <TileColor>${this.config.themeColor}</TileColor>
        </tile>
    </msapplication>
</browserconfig>`;
  }

  /**
   * Generate complete head section with all brand assets
   */
  generateCompleteBrandHead(): string {
    return `<!-- Favicon and App Icons -->
    ${this.generateFaviconTags()}
    
    <!-- PWA Manifest -->
    ${this.generateManifestLinks()}
    
    <!-- Apple-specific -->
    ${this.generateAppleTouchIconTags()}`;
  }
}

// Default instance
export const defaultBrandAssets = new BrandAssetsManager();

// Convenience functions
export function getBrandAssetUrl(type: 'favicon' | 'apple-touch-icon' | 'android-icon' | 'manifest', size?: number): string {
  return defaultBrandAssets.getBrandAssetUrl(type, size);
}

export function generateFaviconTags(): string {
  return defaultBrandAssets.generateFaviconTags();
}

export function generateAppleTouchIconTags(): string {
  return defaultBrandAssets.generateAppleTouchIconTags();
}

export function generateManifestLinks(): string {
  return defaultBrandAssets.generateManifestLinks();
}
