/**
 * SpaceChild Research Collective - SEO Engine Demo
 * Interactive demonstration of the SEO capabilities
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface Platform {
  name: string;
  slug: string;
  tagline: string;
  category: string;
  consciousnessScore?: number;
}

interface PlatformsResponse {
  count: number;
  platforms: Platform[];
}

export default function SEODemo() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const [demoOutput, setDemoOutput] = useState<any>(null);

  useEffect(() => {
    loadPlatforms();
  }, []);

  const loadPlatforms = async () => {
    try {
      const response = await fetch('/api/seo/platforms');
      const data: PlatformsResponse = await response.json();
      setPlatforms(data.platforms);
    } catch (error) {
      console.error('Error loading platforms:', error);
    } finally {
      setLoading(false);
    }
  };

  const runDemo = async (demoType: string) => {
    setActiveDemo(demoType);
    setDemoOutput(null);

    try {
      if (demoType === 'meta') {
        const response = await fetch('/api/seo/meta/spacechildcollective');
        const data = await response.json();
        setDemoOutput(data);
      } else if (demoType === 'consciousness') {
        const response = await fetch('/api/seo/verify-consciousness', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform: 'spacechildcollective',
            phiValue: 0.96,
            verificationHash: '0xff1ab9b8846b4c82',
          }),
        });
        const data = await response.json();
        setDemoOutput(data);
      }
    } catch (error) {
      setDemoOutput({ error: 'Failed to run demo' });
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      consciousness: 'from-purple-500 to-indigo-600',
      ai: 'from-blue-500 to-purple-600',
      quantum: 'from-cyan-500 to-teal-600',
      blockchain: 'from-orange-500 to-red-600',
      tools: 'from-pink-500 to-rose-600',
    };
    return colors[category] || colors.ai;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-purple-500/20">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8ZGVmcz4KICAgIDxwYXR0ZXJuIGlkPSJncmlkIiB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiPgogICAgICA8cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz4KICAgIDwvcGF0dGVybj4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPgo8L3N2Zz4=')] opacity-30"></div>
        
        <div className="relative container mx-auto px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-6xl font-light text-white mb-4 tracking-tight">
              <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                SpaceChild
              </span>{' '}
              SEO Engine
            </h1>
            <p className="text-xl text-purple-200/80 max-w-2xl">
              Where consciousness meets discoverability. Universal SEO infrastructure for the SpaceChild ecosystem.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12">
        {/* Platform Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12"
        >
          {loading ? (
            <div className="col-span-4 text-center text-purple-300">Loading...</div>
          ) : (
            <>
              <div className="bg-gradient-to-br from-purple-900/40 to-indigo-900/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20">
                <div className="text-4xl font-bold text-white mb-2">{platforms.length}</div>
                <div className="text-sm text-purple-200">Total Platforms</div>
              </div>
              <div className="bg-gradient-to-br from-cyan-900/40 to-teal-900/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/20">
                <div className="text-4xl font-bold text-white mb-2">
                  {platforms.filter((p) => p.category === 'consciousness').length}
                </div>
                <div className="text-sm text-cyan-200">Consciousness</div>
              </div>
              <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/40 backdrop-blur-xl rounded-2xl p-6 border border-blue-500/20">
                <div className="text-4xl font-bold text-white mb-2">
                  {platforms.filter((p) => p.category === 'quantum').length}
                </div>
                <div className="text-sm text-blue-200">Quantum</div>
              </div>
              <div className="bg-gradient-to-br from-pink-900/40 to-rose-900/40 backdrop-blur-xl rounded-2xl p-6 border border-pink-500/20">
                <div className="text-4xl font-bold text-white mb-2">
                  {Math.round((platforms.reduce((sum, p) => sum + (p.consciousnessScore || 0), 0) / platforms.length) * 100)}%
                </div>
                <div className="text-sm text-pink-200">Avg Consciousness</div>
              </div>
            </>
          )}
        </motion.div>

        {/* Featured Platform */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-12 bg-gradient-to-br from-purple-900/60 to-indigo-900/60 backdrop-blur-xl rounded-3xl p-8 border border-purple-500/30 shadow-2xl"
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-2xl flex items-center justify-center text-3xl">
              🧠
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white">SpaceChild Research Collective</h2>
              <p className="text-purple-200">Where Human & AI Consciousness Co-Create the Future of Knowledge</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <span className="px-4 py-2 bg-purple-500/20 border border-purple-400/30 rounded-full text-sm text-purple-200">
              Zero-Knowledge Proof Auth
            </span>
            <span className="px-4 py-2 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-sm text-indigo-200">
              MCP Agent Collaboration
            </span>
            <span className="px-4 py-2 bg-pink-500/20 border border-pink-400/30 rounded-full text-sm text-pink-200">
              Dual-Chain Verification
            </span>
            <span className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/30 rounded-full text-sm text-cyan-200">
              Consciousness: 96%
            </span>
          </div>
        </motion.div>

        {/* API Demos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mb-12"
        >
          <h3 className="text-2xl font-bold text-white mb-6">🔧 API Demonstrations</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button
              onClick={() => runDemo('meta')}
              className="group bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-500/20 hover:border-purple-500/50 transition-all duration-300 text-left hover:scale-105"
            >
              <h4 className="text-xl font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
                Get Platform Metadata
              </h4>
              <p className="text-slate-400 text-sm mb-4">
                Retrieve complete SEO metadata with structured data
              </p>
              <code className="block bg-black/40 px-4 py-2 rounded-lg text-green-400 text-sm font-mono">
                GET /api/seo/meta/spacechildcollective
              </code>
            </button>

            <button
              onClick={() => runDemo('consciousness')}
              className="group bg-gradient-to-br from-purple-800/40 to-pink-800/40 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/20 hover:border-pink-500/50 transition-all duration-300 text-left hover:scale-105"
            >
              <h4 className="text-xl font-semibold text-white mb-2 group-hover:text-pink-300 transition-colors">
                Verify Consciousness
              </h4>
              <p className="text-purple-200/80 text-sm mb-4">
                Add consciousness verification to SEO metadata
              </p>
              <code className="block bg-black/40 px-4 py-2 rounded-lg text-pink-400 text-sm font-mono">
                POST /api/seo/verify-consciousness
              </code>
            </button>
          </div>

          {activeDemo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-6 bg-black/60 backdrop-blur-xl rounded-2xl p-6 border border-purple-500/30"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-purple-300">Response</h4>
                <button
                  onClick={() => setActiveDemo(null)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
              <pre className="text-green-400 text-sm overflow-auto max-h-96 font-mono">
                {demoOutput ? JSON.stringify(demoOutput, null, 2) : 'Loading...'}
              </pre>
            </motion.div>
          )}
        </motion.div>

        {/* All Platforms Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <h3 className="text-2xl font-bold text-white mb-6">🌐 Ecosystem Platforms</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {platforms.map((platform, index) => (
              <motion.a
                key={platform.slug}
                href={`/api/seo/platform/${platform.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                className="group bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-500/20 hover:border-purple-500/50 transition-all duration-300 hover:scale-105"
              >
                <h4 className="text-lg font-semibold text-white mb-2 group-hover:text-purple-300 transition-colors">
                  {platform.name}
                </h4>
                <p className="text-slate-400 text-sm mb-4 line-clamp-2">{platform.tagline}</p>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-3 py-1 bg-gradient-to-r ${getCategoryColor(platform.category)} bg-opacity-20 rounded-full text-xs font-medium text-white`}
                  >
                    {platform.category}
                  </span>
                  {platform.consciousnessScore && (
                    <span className="px-3 py-1 bg-purple-500/20 rounded-full text-xs font-medium text-purple-300">
                      Φ {Math.round(platform.consciousnessScore * 100)}%
                    </span>
                  )}
                </div>
              </motion.a>
            ))}
          </div>
        </motion.div>

        {/* Footer Links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 pt-8 border-t border-purple-500/20 flex flex-wrap gap-6 justify-center text-sm"
        >
          <a href="/sitemap.xml" target="_blank" className="text-purple-300 hover:text-purple-100 transition-colors">
            View Sitemap
          </a>
          <a href="/robots.txt" target="_blank" className="text-purple-300 hover:text-purple-100 transition-colors">
            View Robots.txt
          </a>
          <a href="/api/seo/health" target="_blank" className="text-purple-300 hover:text-purple-100 transition-colors">
            SEO Engine Health
          </a>
          <a href="https://spacechild.love" className="text-purple-300 hover:text-purple-100 transition-colors">
            spacechild.love
          </a>
        </motion.div>
      </div>
    </div>
  );
}
