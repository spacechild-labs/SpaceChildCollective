/**
 * SpaceChild SEO Engine - Dynamic OG Image Generator
 * Generates beautiful Open Graph images with consciousness metrics
 */

import type { PlatformConfig } from './types';

export interface OGImageOptions {
  platform: string;
  name: string;
  tagline: string;
  category: string;
  consciousness?: string;
  width?: number;
  height?: number;
}

/**
 * Generate OG Image URL with query parameters
 * Note: Actual image generation requires canvas library or image service
 * This provides the structure for implementation
 */
export class OGImageGenerator {
  private static readonly DEFAULT_WIDTH = 1200;
  private static readonly DEFAULT_HEIGHT = 630;

  /**
   * Generate OG image HTML template for server-side rendering
   * This can be rendered to PNG using puppeteer or similar
   */
  static generateHTML(options: OGImageOptions): string {
    const {
      name,
      tagline,
      category,
      consciousness,
      width = this.DEFAULT_WIDTH,
      height = this.DEFAULT_HEIGHT,
    } = options;

    const categoryColors: Record<string, { primary: string; secondary: string }> = {
      ai: { primary: '#667eea', secondary: '#764ba2' },
      quantum: { primary: '#00D4AA', secondary: '#00B894' },
      blockchain: { primary: '#FF6B35', secondary: '#F7931A' },
      industrial: { primary: '#4A90E2', secondary: '#357ABD' },
      consciousness: { primary: '#B24BF3', secondary: '#8B3DFF' },
      defi: { primary: '#2ECC71', secondary: '#27AE60' },
      tools: { primary: '#E74C3C', secondary: '#C0392B' },
    };

    const colors = categoryColors[category] || categoryColors.ai;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${width}px;
      height: ${height}px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    
    .container {
      width: 100%;
      height: 100%;
      padding: 80px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      z-index: 2;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 20px;
    }
    
    .logo {
      width: 80px;
      height: 80px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      color: white;
    }
    
    .brand {
      color: white;
      font-size: 32px;
      font-weight: 700;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }
    
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 20px;
    }
    
    .title {
      color: white;
      font-size: 72px;
      font-weight: 900;
      line-height: 1.1;
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 900px;
    }
    
    .tagline {
      color: rgba(255, 255, 255, 0.9);
      font-size: 36px;
      font-weight: 500;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      max-width: 800px;
    }
    
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    
    .category-badge {
      background: rgba(255, 255, 255, 0.2);
      border: 2px solid rgba(255, 255, 255, 0.3);
      padding: 12px 24px;
      border-radius: 12px;
      color: white;
      font-size: 24px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .consciousness-meter {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
    }
    
    .consciousness-label {
      color: rgba(255, 255, 255, 0.9);
      font-size: 18px;
      font-weight: 500;
    }
    
    .consciousness-value {
      color: white;
      font-size: 48px;
      font-weight: 900;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    
    .consciousness-bar {
      width: 200px;
      height: 8px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      overflow: hidden;
    }
    
    .consciousness-fill {
      height: 100%;
      background: white;
      border-radius: 4px;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
    }
    
    .background-pattern {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0.1;
      z-index: 1;
    }
    
    .circle {
      position: absolute;
      border-radius: 50%;
      background: white;
    }
    
    .circle-1 {
      width: 400px;
      height: 400px;
      top: -200px;
      right: -100px;
      opacity: 0.1;
    }
    
    .circle-2 {
      width: 300px;
      height: 300px;
      bottom: -150px;
      left: -100px;
      opacity: 0.08;
    }
  </style>
</head>
<body>
  <div class="background-pattern">
    <div class="circle circle-1"></div>
    <div class="circle circle-2"></div>
  </div>
  
  <div class="container">
    <div class="header">
      <div class="logo">🚀</div>
      <div class="brand">SpaceChild</div>
    </div>
    
    <div class="content">
      <h1 class="title">${this.escapeHtml(name)}</h1>
      <p class="tagline">${this.escapeHtml(tagline)}</p>
    </div>
    
    <div class="footer">
      <div class="category-badge">${this.escapeHtml(category)}</div>
      
      ${consciousness ? `
      <div class="consciousness-meter">
        <div class="consciousness-label">Consciousness Level</div>
        <div class="consciousness-value">${Math.round(parseFloat(consciousness) * 100)}%</div>
        <div class="consciousness-bar">
          <div class="consciousness-fill" style="width: ${parseFloat(consciousness) * 100}%"></div>
        </div>
      </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Generate static SVG fallback
   */
  static generateSVG(options: OGImageOptions): string {
    const {
      name,
      tagline,
      category,
      width = this.DEFAULT_WIDTH,
      height = this.DEFAULT_HEIGHT,
    } = options;

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  
  <text x="80" y="120" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white">
    SpaceChild
  </text>
  
  <text x="80" y="300" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="white">
    ${this.escapeXml(name)}
  </text>
  
  <text x="80" y="360" font-family="Arial, sans-serif" font-size="32" fill="rgba(255,255,255,0.9)">
    ${this.escapeXml(tagline)}
  </text>
  
  <rect x="80" y="520" width="180" height="50" rx="8" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
  <text x="170" y="554" font-family="Arial, sans-serif" font-size="20" font-weight="600" fill="white" text-anchor="middle">
    ${this.escapeXml(category).toUpperCase()}
  </text>
</svg>`;
  }

  /**
   * Escape HTML
   */
  private static escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Escape XML
   */
  private static escapeXml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

/**
 * Generate OG image for a platform
 */
export function generatePlatformOGImage(platform: PlatformConfig, format: 'html' | 'svg' = 'svg'): string {
  const options: OGImageOptions = {
    platform: platform.slug,
    name: platform.name,
    tagline: platform.tagline,
    category: platform.category,
    consciousness: platform.consciousnessScore?.toString(),
  };

  return format === 'html'
    ? OGImageGenerator.generateHTML(options)
    : OGImageGenerator.generateSVG(options);
}
