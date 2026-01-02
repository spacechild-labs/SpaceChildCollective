/**
 * Space Child PWA Install Prompt
 * Beautiful install banner that appears when the app is installable
 */

import { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useSpaceChildPWA } from '@/hooks/useSpaceChildPWA';

interface PWAInstallPromptProps {
  appName?: string;
  delay?: number;
  className?: string;
}

export function PWAInstallPrompt({ 
  appName = 'Space Child',
  delay = 3000,
  className = ''
}: PWAInstallPromptProps) {
  const { isInstallable, isInstalled, installApp } = useSpaceChildPWA();
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const dismissedAt = localStorage.getItem('pwa-install-dismissed');
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      const hoursSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      if (hoursSinceDismissed < 24) {
        setDismissed(true);
        return;
      }
    }

    if (isInstallable && !isInstalled && !dismissed) {
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isInstallable, isInstalled, dismissed, delay]);

  const handleInstall = async () => {
    const success = await installApp();
    if (success) {
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!showPrompt || isInstalled || dismissed) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 animate-in slide-in-from-bottom-5 duration-300 ${className}`}>
      <Card className="p-4 shadow-2xl border border-purple-500/30 bg-gradient-to-br from-slate-900/95 to-purple-950/95 backdrop-blur-lg">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/30">
            <Smartphone className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white mb-1">
              Install {appName}
            </h3>
            <p className="text-sm text-gray-300 mb-3">
              Get quick access, offline support, and a native app experience
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="inline-flex items-center justify-center gap-1.5 min-h-8 rounded-md px-3 text-xs bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="inline-flex items-center justify-center min-h-8 rounded-md px-3 text-xs text-gray-400 hover:text-white hover:bg-white/10 font-medium transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10 -mt-1 -mr-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </Card>
    </div>
  );
}

export default PWAInstallPrompt;
