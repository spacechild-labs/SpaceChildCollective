/**
 * Space Child SSO React Hook for SpaceChildCollective
 * Use this hook for authentication in React components
 */

import { useState, useEffect, useCallback } from 'react';
import { SpaceChildSSO, getSpaceChildSSO, type SpaceChildUser } from '@/lib/space-child-sso';

const SUBDOMAIN = 'spacechild-collective';

let sso: SpaceChildSSO | null = null;

function getSSO(): SpaceChildSSO {
  if (!sso) {
    sso = getSpaceChildSSO({ subdomain: SUBDOMAIN });
  }
  return sso;
}

export function useSpaceChildAuth() {
  const [user, setUser] = useState<SpaceChildUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const ssoClient = getSSO();
    const tokens = ssoClient.handleCallback();
    if (tokens) {
      setAccessToken(tokens.accessToken);
    } else {
      setAccessToken(ssoClient.getAccessToken());
    }
  }, []);

  useEffect(() => {
    if (accessToken === null) return;
    if (!accessToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const fetchUser = async () => {
      const ssoClient = getSSO();
      const userData = await ssoClient.getCurrentUser();
      setUser(userData);
      setIsLoading(false);
    };
    fetchUser();
  }, [accessToken]);

  const login = useCallback(() => getSSO().redirectToLogin(), []);
  const logout = useCallback(async () => {
    await getSSO().logout();
    setUser(null);
    setAccessToken(null);
    window.location.href = '/';
  }, []);

  const refreshToken = useCallback(async () => {
    const tokens = await getSSO().refreshAccessToken();
    if (tokens) {
      setAccessToken(tokens.accessToken);
      return true;
    }
    return false;
  }, []);

  return { user, isLoading, isAuthenticated: !!user, accessToken, login, logout, refreshToken };
}
