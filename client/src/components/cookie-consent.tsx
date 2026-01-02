import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, X, Shield, Check, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState({
    essential: true,
    analytics: false,
  });

  useEffect(() => {
    const consent = localStorage.getItem("scrc-cookie-consent");
    const gpcSignal = (navigator as any).globalPrivacyControl;
    
    if (gpcSignal) {
      const gpcConsent = {
        essential: true,
        analytics: false,
        timestamp: new Date().toISOString(),
        gpcApplied: true,
      };
      localStorage.setItem("scrc-cookie-consent", JSON.stringify(gpcConsent));
      applyConsent(false);
    } else if (!consent) {
      setTimeout(() => setShowBanner(true), 1500);
    } else {
      const parsed = JSON.parse(consent);
      applyConsent(parsed.analytics);
    }
  }, []);

  const applyConsent = (analyticsEnabled: boolean) => {
    if (!analyticsEnabled) {
      (window as any)['ga-disable-G-CMEBRPNPGG'] = true;
    }
  };

  const handleAcceptAll = () => {
    const consent = {
      essential: true,
      analytics: true,
      timestamp: new Date().toISOString(),
      gpcApplied: false,
    };
    localStorage.setItem("scrc-cookie-consent", JSON.stringify(consent));
    applyConsent(true);
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    const consent = {
      essential: true,
      analytics: false,
      timestamp: new Date().toISOString(),
      gpcApplied: false,
    };
    localStorage.setItem("scrc-cookie-consent", JSON.stringify(consent));
    applyConsent(false);
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    const consent = {
      ...preferences,
      timestamp: new Date().toISOString(),
      gpcApplied: false,
    };
    localStorage.setItem("scrc-cookie-consent", JSON.stringify(consent));
    applyConsent(preferences.analytics);
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
        >
          <Card className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-500/30 shadow-2xl shadow-indigo-500/10">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30">
                    <Cookie className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      Cookie Preferences
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Research Collective Privacy Protocol</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowBanner(false)}
                  className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
                  aria-label="Close cookie banner"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Main Content */}
              <div className="text-slate-600 dark:text-slate-300 mb-6">
                <p className="mb-3 leading-relaxed">
                  SpaceChild Research Collective uses cookies to enhance your research experience and understand how scholars interact with our platform. Your privacy is foundational to ethical research—you control what data we collect.
                </p>
                
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-4 mt-4"
                  >
                    {/* Essential Cookies */}
                    <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          <h3 className="font-semibold text-indigo-700 dark:text-indigo-400">Essential Cookies</h3>
                        </div>
                        <span className="text-xs text-indigo-600/70 dark:text-indigo-400/70 font-mono">Always Active</span>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Required for authentication, blockchain verification, and core research platform functionality. Cannot be disabled.
                      </p>
                    </div>

                    {/* Analytics Cookies */}
                    <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={preferences.analytics}
                            onChange={(e) =>
                              setPreferences({ ...preferences, analytics: e.target.checked })
                            }
                            className="w-4 h-4 accent-purple-600 rounded"
                          />
                          <h3 className="font-semibold text-purple-700 dark:text-purple-400">Analytics Cookies</h3>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Google Analytics helps us understand research collaboration patterns and improve the platform. May be used for behavioral advertising.
                      </p>
                    </div>

                    {/* GPC Notice */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 border border-slate-200 dark:border-white/10 p-3 rounded-lg">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        <strong className="text-indigo-600 dark:text-indigo-400">Global Privacy Control (GPC):</strong>{" "}
                        {(navigator as any).globalPrivacyControl ? (
                          <span className="text-green-600 dark:text-green-400">
                            ✓ Signal detected—analytics automatically disabled.
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">
                            Not detected. Configure preferences manually above.
                          </span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                )}

                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                  Review our{" "}
                  <Link href="/privacy">
                    <a className="text-indigo-600 dark:text-indigo-400 hover:text-purple-600 dark:hover:text-purple-400 underline transition-colors">
                      Privacy Policy
                    </a>
                  </Link>{" "}
                  for complete data handling protocols.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setShowDetails(!showDetails)}
                  variant="outline"
                  className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {showDetails ? "Hide Details" : "Manage Preferences"}
                </Button>
                
                {showDetails ? (
                  <Button
                    onClick={handleSavePreferences}
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Save Preferences
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleRejectAll}
                      variant="outline"
                      className="border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Reject All
                    </Button>
                    <Button
                      onClick={handleAcceptAll}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                    >
                      <FlaskConical className="w-4 h-4 mr-2" />
                      Accept All
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
