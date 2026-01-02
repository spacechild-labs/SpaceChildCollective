/**
 * Space Child Auth SSO Client
 * Shared SSO integration for Space Child ecosystem
 * 
 * Usage:
 * 1. Set VITE_SPACE_CHILD_AUTH_URL in your .env
 * 2. Import and use SpaceChildSSO class or useSpaceChildSSO hook
 */

const DEFAULT_AUTH_URL = 'https://space-child-dream.replit.app';

export interface SpaceChildSSOConfig {
  authServerUrl?: string;
  subdomain: string;
  storagePrefix?: string;
}

export interface SpaceChildUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface SSOTokens {
  accessToken: string;
  refreshToken: string;
}

export class SpaceChildSSO {
  private authServerUrl: string;
  private subdomain: string;
  private storagePrefix: string;

  constructor(config: SpaceChildSSOConfig) {
    this.authServerUrl = config.authServerUrl || 
      (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SPACE_CHILD_AUTH_URL : null) || 
      DEFAULT_AUTH_URL;
    this.subdomain = config.subdomain;
    this.storagePrefix = config.storagePrefix || 'space_child_sso';
  }

  getAccessToken(): string | null {
    return localStorage.getItem(`${this.storagePrefix}_access_token`);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(`${this.storagePrefix}_refresh_token`);
  }

  setTokens(tokens: SSOTokens): void {
    localStorage.setItem(`${this.storagePrefix}_access_token`, tokens.accessToken);
    localStorage.setItem(`${this.storagePrefix}_refresh_token`, tokens.refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem(`${this.storagePrefix}_access_token`);
    localStorage.removeItem(`${this.storagePrefix}_refresh_token`);
  }

  // Check URL for SSO callback tokens
  handleCallback(): SSOTokens | null {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');

    if (accessToken && refreshToken) {
      const tokens = { accessToken, refreshToken };
      this.setTokens(tokens);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return tokens;
    }
    return null;
  }

  // Redirect to Space Child Auth for login
  redirectToLogin(callbackPath: string = '/sso/callback'): void {
    const callbackUrl = `${window.location.origin}${callbackPath}`;
    const loginUrl = `${this.authServerUrl}/api/space-child-auth/sso/authorize?subdomain=${this.subdomain}&callback=${encodeURIComponent(callbackUrl)}`;
    window.location.href = loginUrl;
  }

  // Verify token with auth server
  async verifyToken(token: string): Promise<SpaceChildUser | null> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/sso/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, subdomain: this.subdomain }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          return {
            id: data.userId,
            email: data.email,
            firstName: data.firstName,
            lastName: data.lastName,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('SSO verify error:', error);
      return null;
    }
  }

  // Refresh access token
  async refreshAccessToken(): Promise<SSOTokens | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        const tokens = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        };
        this.setTokens(tokens);
        return tokens;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Logout
  async logout(): Promise<void> {
    const token = this.getAccessToken();
    if (token) {
      try {
        await fetch(`${this.authServerUrl}/api/space-child-auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore logout errors
      }
    }
    this.clearTokens();
  }

  // Get current user (verifies token)
  async getCurrentUser(): Promise<SpaceChildUser | null> {
    const token = this.getAccessToken();
    if (!token) return null;

    let user = await this.verifyToken(token);
    
    // Try refresh if verification failed
    if (!user) {
      const newTokens = await this.refreshAccessToken();
      if (newTokens) {
        user = await this.verifyToken(newTokens.accessToken);
      }
    }

    if (!user) {
      this.clearTokens();
    }

    return user;
  }
}

// Singleton instance for the app
let ssoInstance: SpaceChildSSO | null = null;

export function getSpaceChildSSO(config: SpaceChildSSOConfig): SpaceChildSSO {
  if (!ssoInstance) {
    ssoInstance = new SpaceChildSSO(config);
  }
  return ssoInstance;
}
