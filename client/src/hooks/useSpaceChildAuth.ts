/**
 * Space Child Auth React Hook for SpaceChildCollective
 * Supports both direct authentication and SSO
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  getSpaceChildAuth, 
  type SpaceChildUser, 
  type AuthTokens,
  type LoginParams,
  type RegisterParams,
  type AuthResult,
} from '@/lib/space-child-auth';

const SUBDOMAIN = 'spacechild-collective';

export function useSpaceChildAuth() {
  const authClient = useMemo(() => getSpaceChildAuth({ subdomain: SUBDOMAIN }), []);

  const [user, setUser] = useState<SpaceChildUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ssoTokens = authClient.handleSSOCallback();
    setAccessToken(ssoTokens ? ssoTokens.accessToken : authClient.getAccessToken());
  }, [authClient]);

  useEffect(() => {
    if (accessToken === null) return;
    if (!accessToken) { setUser(null); setIsLoading(false); return; }
    const fetchUser = async () => {
      try { setUser(await authClient.getCurrentUser()); }
      catch (err: any) { setError(err.message); setUser(null); }
      finally { setIsLoading(false); }
    };
    fetchUser();
  }, [accessToken, authClient]);

  const login = useCallback(async (params: LoginParams): Promise<AuthResult> => {
    setError(null);
    const result = await authClient.login(params);
    if (result.success && result.accessToken) setAccessToken(result.accessToken);
    else if (result.error) setError(result.error);
    return result;
  }, [authClient]);

  const register = useCallback(async (params: RegisterParams): Promise<AuthResult> => {
    setError(null);
    const result = await authClient.register(params);
    if (result.success && result.accessToken) setAccessToken(result.accessToken);
    else if (result.error) setError(result.error);
    return result;
  }, [authClient]);

  const verifyEmail = useCallback(async (token: string): Promise<AuthResult> => {
    setError(null);
    const result = await authClient.verifyEmail(token);
    if (result.success && result.accessToken) setAccessToken(result.accessToken);
    else if (result.error) setError(result.error);
    return result;
  }, [authClient]);

  const resendVerification = useCallback((email: string) => authClient.resendVerification(email), [authClient]);
  const forgotPassword = useCallback((email: string) => authClient.forgotPassword(email), [authClient]);

  const resetPassword = useCallback(async (token: string, password: string): Promise<AuthResult> => {
    setError(null);
    const result = await authClient.resetPassword(token, password);
    if (result.success && result.accessToken) setAccessToken(result.accessToken);
    else if (result.error) setError(result.error);
    return result;
  }, [authClient]);

  const loginWithSSO = useCallback(() => authClient.redirectToSSO(), [authClient]);
  const handleSSOCallback = useCallback(() => {
    const tokens = authClient.handleSSOCallback();
    if (tokens) setAccessToken(tokens.accessToken);
    return tokens;
  }, [authClient]);

  const logout = useCallback(async () => {
    await authClient.logout();
    setUser(null);
    setAccessToken(null);
  }, [authClient]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const tokens = await authClient.refreshAccessToken();
    if (tokens) { setAccessToken(tokens.accessToken); return true; }
    return false;
  }, [authClient]);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try { setUser(await authClient.getCurrentUser()); }
    catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  }, [accessToken, authClient]);

  return {
    user, isLoading, isAuthenticated: !!user && !!accessToken, accessToken, error,
    login, register, verifyEmail, resendVerification, forgotPassword, resetPassword,
    loginWithSSO, handleSSOCallback, logout, refreshToken, refetch, authClient,
  };
}

export type { SpaceChildUser, AuthTokens, LoginParams, RegisterParams, AuthResult };
