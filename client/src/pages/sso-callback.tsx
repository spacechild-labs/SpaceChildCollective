import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function SSOCallbackPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/'), 100);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-t-2 border-cyan-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-mono text-sm">Completing login...</p>
      </div>
    </div>
  );
}
