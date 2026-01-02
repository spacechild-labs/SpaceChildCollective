/**
 * Space Child Offline Indicator
 * Shows a toast notification when network status changes
 */

import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useSpaceChildPWA } from '@/hooks/useSpaceChildPWA';

interface OfflineIndicatorProps {
  className?: string;
  autoHideDelay?: number;
}

export function OfflineIndicator({ 
  className = '',
  autoHideDelay = 3000 
}: OfflineIndicatorProps) {
  const { isOnline } = useSpaceChildPWA();
  const [showToast, setShowToast] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setShowToast(true);
    } else if (wasOffline) {
      setShowToast(true);
      const timer = setTimeout(() => {
        setShowToast(false);
        setWasOffline(false);
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline, autoHideDelay]);

  if (!showToast) {
    return null;
  }

  return (
    <div className={`fixed top-4 right-4 z-50 animate-in slide-in-from-top-5 duration-300 ${className}`}>
      <div 
        className={`
          px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2.5
          backdrop-blur-lg border
          ${isOnline 
            ? 'bg-green-500/90 border-green-400/50 text-white' 
            : 'bg-red-500/90 border-red-400/50 text-white'
          }
        `}
      >
        {isOnline ? (
          <Wifi className="w-4 h-4" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">
          {isOnline ? 'Back online' : 'No internet connection'}
        </span>
      </div>
    </div>
  );
}

export default OfflineIndicator;
