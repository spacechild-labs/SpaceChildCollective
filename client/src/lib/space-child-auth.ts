/**
 * Space Child Auth - Unified Authentication Library
 * Supports both direct authentication and SSO for the Space Child ecosystem
 */

const DEFAULT_AUTH_URL = 'https://space-child-dream.replit.app';

export interface SpaceChildAuthConfig {
  authServerUrl?: string;
  subdomain: string;
  storagePrefix?: string;
}

export interface SpaceChildUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl?: string | null;
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export interface RegisterParams {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResult {
  success: boolean;
  user?: SpaceChildUser;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  requiresVerification?: boolean;
  message?: string;
}

export class SpaceChildAuth {
  private authServerUrl: string;
  private subdomain: string;
  private storagePrefix: string;

  constructor(config: SpaceChildAuthConfig) {
    this.authServerUrl = config.authServerUrl || 
      (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_SPACE_CHILD_AUTH_URL : null) || 
      DEFAULT_AUTH_URL;
    this.subdomain = config.subdomain;
    this.storagePrefix = config.storagePrefix || 'space_child_auth';
  }

  getAccessToken(): string | null { return localStorage.getItem(`${this.storagePrefix}_access_token`); }
  getRefreshToken(): string | null { return localStorage.getItem(`${this.storagePrefix}_refresh_token`); }
  setTokens(tokens: AuthTokens): void {
    localStorage.setItem(`${this.storagePrefix}_access_token`, tokens.accessToken);
    localStorage.setItem(`${this.storagePrefix}_refresh_token`, tokens.refreshToken);
  }
  clearTokens(): void {
    localStorage.removeItem(`${this.storagePrefix}_access_token`);
    localStorage.removeItem(`${this.storagePrefix}_refresh_token`);
  }

  async login(params: LoginParams): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error || 'Login failed', requiresVerification: data.requiresVerification };
      if (data.accessToken && data.refreshToken) this.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return { success: true, user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch (error: any) { return { success: false, error: error.message || 'Login failed' }; }
  }

  async register(params: RegisterParams): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error || 'Registration failed' };
      if (data.requiresVerification) return { success: true, user: data.user, requiresVerification: true, message: data.message };
      if (data.accessToken && data.refreshToken) this.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return { success: true, user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
    } catch (error: any) { return { success: false, error: error.message || 'Registration failed' }; }
  }

  async verifyEmail(token: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/verify-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error || 'Verification failed' };
      if (data.accessToken && data.refreshToken) this.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return { success: true, user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, message: data.message };
    } catch (error: any) { return { success: false, error: error.message || 'Verification failed' }; }
  }

  async resendVerification(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/resend-verification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await response.json();
      return response.ok ? { success: true } : { success: false, error: data.error || 'Failed to resend' };
    } catch (error: any) { return { success: false, error: error.message || 'Failed to resend' }; }
  }

  async forgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
      });
      const data = await response.json();
      return response.ok ? { success: true } : { success: false, error: data.error || 'Failed to send reset email' };
    } catch (error: any) { return { success: false, error: error.message || 'Failed to send reset email' }; }
  }

  async resetPassword(token: string, password: string): Promise<AuthResult> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.error || 'Password reset failed' };
      if (data.accessToken && data.refreshToken) this.setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return { success: true, user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken, message: data.message };
    } catch (error: any) { return { success: false, error: error.message || 'Password reset failed' }; }
  }

  handleSSOCallback(): AuthTokens | null {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    if (accessToken && refreshToken) {
      const tokens = { accessToken, refreshToken };
      this.setTokens(tokens);
      window.history.replaceState({}, document.title, window.location.pathname);
      return tokens;
    }
    return null;
  }

  redirectToSSO(callbackPath: string = '/sso/callback'): void {
    const callbackUrl = `${window.location.origin}${callbackPath}`;
    window.location.href = `${this.authServerUrl}/api/space-child-auth/sso/authorize?subdomain=${this.subdomain}&callback=${encodeURIComponent(callbackUrl)}`;
  }

  async getCurrentUser(): Promise<SpaceChildUser | null> {
    const token = this.getAccessToken();
    if (!token) return null;
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/user`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return this.getCurrentUser();
        this.clearTokens();
        return null;
      }
      if (!response.ok) return null;
      return response.json();
    } catch (error) { return null; }
  }

  async verifyToken(token: string): Promise<SpaceChildUser | null> {
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/sso/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, subdomain: this.subdomain }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.valid) return { id: data.userId, email: data.email, firstName: data.firstName, lastName: data.lastName };
      }
      return null;
    } catch (error) { return null; }
  }

  async refreshAccessToken(): Promise<AuthTokens | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${this.authServerUrl}/api/space-child-auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
      });
      if (response.ok) {
        const data = await response.json();
        const tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
        this.setTokens(tokens);
        return tokens;
      }
      return null;
    } catch { return null; }
  }

  async logout(): Promise<void> {
    const token = this.getAccessToken();
    if (token) { try { await fetch(`${this.authServerUrl}/api/space-child-auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch {} }
    this.clearTokens();
  }

  getAuthServerUrl(): string { return this.authServerUrl; }
  getSubdomain(): string { return this.subdomain; }
}

let authInstance: SpaceChildAuth | null = null;
export function getSpaceChildAuth(config: SpaceChildAuthConfig): SpaceChildAuth {
  if (!authInstance || authInstance.getSubdomain() !== config.subdomain) authInstance = new SpaceChildAuth(config);
  return authInstance;
}
export function resetSpaceChildAuth(): void { authInstance = null; }
