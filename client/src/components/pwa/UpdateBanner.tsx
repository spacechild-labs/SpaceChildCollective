/**
 * Space Child Update Banner
 * Shows when a new version of the app is available
 */

import { RefreshCw, X } from 'lucide-react';
import { useSpaceChildPWA } from '@/hooks/useSpaceChildPWA';
import { useState } from 'react';

interface UpdateBannerProps {
  className?: string;
  autoUpdate?: boolean;
  autoUpdateDelay?: number;
}

export function UpdateBanner({ 
  className = '',
  autoUpdate = false,
  autoUpdateDelay = 5000
}: UpdateBannerProps) {
  const { hasUpdate, applyUpdate } = useSpaceChildPWA();
  const [dismissed, setDismissed] = useState(false);

  if (autoUpdate && hasUpdate && !dismissed) {
    setTimeout(() => {
      applyUpdate();
    }, autoUpdateDelay);
  }

  if (!hasUpdate || dismissed) {
    return null;
  }

  return (
    <div className={`fixed top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:right-auto md:max-w-md z-50 animate-in slide-in-from-top-5 duration-300 ${className}`}>
      <div className="px-4 py-3 rounded-lg shadow-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white flex items-center gap-3 border border-white/20">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <div className="flex-1">
          <p className="text-sm font-medium">New version available!</p>
          {autoUpdate && (
            <p className="text-xs text-white/80">Updating automatically...</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={applyUpdate}
            className="inline-flex items-center justify-center min-h-8 rounded-md px-3 text-xs bg-white/20 hover:bg-white/30 text-white border-0 font-medium transition-colors"
          >
            Update now
          </button>
          {!autoUpdate && (
            <button
              onClick={() => setDismissed(true)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default UpdateBanner;
