/**
 * Space Child PWA React Hook
 * Provides reactive PWA state and actions for React components
 */

import { useState, useEffect, useCallback } from 'react';
import { spaceChildPWA, type PWAStatus, type NotificationPayload } from '@/lib/space-child-pwa';

export interface UseSpaceChildPWAReturn {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  installApp: () => Promise<boolean>;
  applyUpdate: () => void;
  checkForUpdates: () => Promise<boolean>;
  requestNotifications: () => Promise<boolean>;
  sendNotification: (payload: NotificationPayload) => Promise<boolean>;
  cacheData: (key: string, data: unknown) => Promise<void>;
  getCachedData: <T>(key: string) => Promise<T | null>;
}

export function useSpaceChildPWA(): UseSpaceChildPWAReturn {
  const [status, setStatus] = useState<PWAStatus>(() => spaceChildPWA.getStatus());

  useEffect(() => {
    setStatus(spaceChildPWA.getStatus());

    const unsubInstallable = spaceChildPWA.on('installable', () => {
      setStatus(spaceChildPWA.getStatus());
    });

    const unsubInstalled = spaceChildPWA.on('installed', () => {
      setStatus(spaceChildPWA.getStatus());
    });

    const unsubOnline = spaceChildPWA.on('online', () => {
      setStatus(spaceChildPWA.getStatus());
    });

    const unsubOffline = spaceChildPWA.on('offline', () => {
      setStatus(spaceChildPWA.getStatus());
    });

    const unsubUpdate = spaceChildPWA.on('update', () => {
      setStatus(spaceChildPWA.getStatus());
    });

    const unsubNotification = spaceChildPWA.on('notification-permission', () => {
      setStatus(spaceChildPWA.getStatus());
    });

    return () => {
      unsubInstallable();
      unsubInstalled();
      unsubOnline();
      unsubOffline();
      unsubUpdate();
      unsubNotification();
    };
  }, []);

  const installApp = useCallback(async () => {
    const result = await spaceChildPWA.showInstallPrompt();
    setStatus(spaceChildPWA.getStatus());
    return result;
  }, []);

  const applyUpdate = useCallback(() => {
    spaceChildPWA.applyUpdate();
  }, []);

  const checkForUpdates = useCallback(async () => {
    const hasUpdate = await spaceChildPWA.checkForUpdates();
    setStatus(spaceChildPWA.getStatus());
    return hasUpdate;
  }, []);

  const requestNotifications = useCallback(async () => {
    const granted = await spaceChildPWA.requestNotificationPermission();
    setStatus(spaceChildPWA.getStatus());
    return granted;
  }, []);

  const sendNotification = useCallback(async (payload: NotificationPayload) => {
    return spaceChildPWA.sendNotification(payload);
  }, []);

  const cacheData = useCallback(async (key: string, data: unknown) => {
    return spaceChildPWA.cacheData(key, data);
  }, []);

  const getCachedData = useCallback(async <T>(key: string) => {
    return spaceChildPWA.getCachedData<T>(key);
  }, []);

  return {
    isInstallable: status.isInstallable,
    isInstalled: status.isInstalled,
    isOnline: status.isOnline,
    hasUpdate: status.hasUpdate,
    notificationPermission: status.notificationPermission,
    installApp,
    applyUpdate,
    checkForUpdates,
    requestNotifications,
    sendNotification,
    cacheData,
    getCachedData,
  };
}

export default useSpaceChildPWA;
