/**
 * Space Child PWA Manager
 * Unified Progressive Web App functionality for all Space Child apps
 * Features: Service worker management, install prompts, notifications, offline support
 */

export interface PWAInstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

export interface PWAStatus {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  hasUpdate: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  serviceWorkerStatus: 'unsupported' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';
}

export type PWAEventType = 'installable' | 'installed' | 'online' | 'offline' | 'update' | 'notification-permission';

export type PWAEventCallback = (data?: unknown) => void;

class SpaceChildPWA {
  private deferredPrompt: PWAInstallPrompt | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private hasUpdate: boolean = false;
  private updateCheckInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<PWAEventType, Set<PWAEventCallback>> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initialize();
    }
  }

  private async initialize() {
    await this.registerServiceWorker();
    this.setupEventListeners();
    this.startUpdatePolling();
  }

  private async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('⚠️ Service workers not supported');
      return;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none'
      });
      console.log('✅ Space Child SW registered:', this.swRegistration.scope);

      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration?.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 New version available');
              this.hasUpdate = true;
              this.emit('update', true);
            }
          });
        }
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

    } catch (error) {
      console.error('❌ SW registration failed:', error);
    }
  }

  private setupEventListeners() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as PWAInstallPrompt;
      console.log('📱 PWA install prompt available');
      this.emit('installable', true);
    });

    window.addEventListener('appinstalled', () => {
      console.log('🎉 PWA installed successfully');
      this.deferredPrompt = null;
      this.emit('installed', true);
    });

    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('🌐 Back online');
      this.emit('online', true);
      this.syncOfflineData();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('📴 Offline mode');
      this.emit('offline', true);
    });
  }

  private startUpdatePolling() {
    this.updateCheckInterval = setInterval(() => {
      this.checkForUpdates();
    }, 60000);
  }

  async checkForUpdates(): Promise<boolean> {
    if (!this.swRegistration) return false;
    
    try {
      await this.swRegistration.update();
      return this.hasUpdate;
    } catch (error) {
      console.warn('Update check failed:', error);
      return false;
    }
  }

  applyUpdate(): void {
    if (!this.swRegistration?.waiting) {
      window.location.reload();
      return;
    }
    this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  on(event: PWAEventType, callback: PWAEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: PWAEventType, data?: unknown) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  isInstallable(): boolean {
    return this.deferredPrompt !== null;
  }

  isInstalled(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true;
  }

  async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.log('No install prompt available');
      return false;
    }

    try {
      await this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('✅ User accepted PWA install');
        return true;
      } else {
        console.log('❌ User declined PWA install');
        return false;
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
      return false;
    } finally {
      this.deferredPrompt = null;
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.emit('notification-permission', 'granted');
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.emit('notification-permission', permission);
      return permission === 'granted';
    }

    return false;
  }

  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    if (!this.swRegistration) {
      console.log('No service worker registration');
      return false;
    }

    const hasPermission = await this.requestNotificationPermission();
    if (!hasPermission) {
      console.log('Notification permission denied');
      return false;
    }

    try {
      await this.swRegistration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || '/favicon.png',
        badge: payload.badge || '/favicon.png',
        data: payload.data || {},
        tag: 'space-child-notification',
        ...(payload.actions && { actions: payload.actions })
      });
      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  getConnectionStatus(): 'online' | 'offline' {
    return this.isOnline ? 'online' : 'offline';
  }

  private async syncOfflineData(): Promise<void> {
    if (!this.swRegistration || !this.isOnline) return;

    try {
      // @ts-ignore
      await this.swRegistration.sync?.register('space-child-sync');
      console.log('🔄 Syncing offline data');
    } catch (error) {
      console.warn('Background sync not supported:', error);
    }
  }

  async cacheData(key: string, data: unknown): Promise<void> {
    if (!('caches' in window)) return;

    try {
      const cache = await caches.open('space-child-data-v1');
      const response = new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
      });
      await cache.put(key, response);
    } catch (error) {
      console.error('Failed to cache data:', error);
    }
  }

  async getCachedData<T>(key: string): Promise<T | null> {
    if (!('caches' in window)) return null;

    try {
      const cache = await caches.open('space-child-data-v1');
      const response = await cache.match(key);
      if (response) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Failed to retrieve cached data:', error);
      return null;
    }
  }

  getStatus(): PWAStatus {
    let swStatus: PWAStatus['serviceWorkerStatus'] = 'unsupported';
    
    if (this.swRegistration) {
      if (this.swRegistration.installing) swStatus = 'installing';
      else if (this.swRegistration.waiting) swStatus = 'installed';
      else if (this.swRegistration.active) swStatus = 'activated';
    }

    return {
      isInstallable: this.isInstallable(),
      isInstalled: this.isInstalled(),
      isOnline: this.isOnline,
      hasUpdate: this.hasUpdate,
      notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
      serviceWorkerStatus: swStatus
    };
  }

  destroy() {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }
    this.listeners.clear();
  }
}

export const spaceChildPWA = new SpaceChildPWA();
export default spaceChildPWA;
