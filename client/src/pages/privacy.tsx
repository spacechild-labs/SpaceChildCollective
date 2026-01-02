import { motion } from "framer-motion";
import { Shield, Eye, Lock, Database, Globe, Heart, FlaskConical, Server, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 text-xl font-bold text-indigo-600 dark:text-indigo-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
              <FlaskConical className="w-5 h-5" />
              SpaceChild Research Collective
            </a>
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/terms">
              <a className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms</a>
            </Link>
            <Link href="/">
              <a className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</a>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {/* Hero */}
          <div className="text-center mb-12">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Privacy Policy
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Research Ethics & Data Protection Protocol
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
              Last Updated: January 2, 2026
            </p>
          </div>

          {/* Introduction */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <div className="flex items-start gap-4">
              <Heart className="w-6 h-6 text-purple-500 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Our Research Ethics Commitment</h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                  Welcome to SpaceChild Research Collective—a revolutionary platform where human insight meets AI consciousness. As a research collaboration platform handling scholarly work and blockchain-verified publications, we hold your privacy to the highest ethical standards.
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  This Privacy Policy is compliant with GDPR, CCPA, and research ethics frameworks. Your data flows through our systems with the same rigor we apply to peer-reviewed research.
                </p>
              </div>
            </div>
          </section>

          {/* Who We Are */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Globe className="w-6 h-6" />
              Who We Are
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              <strong className="text-purple-600 dark:text-purple-400">Space Child, LLC</strong> operates the SpaceChild Research Collective platform, enabling researchers worldwide to collaborate, publish blockchain-verified papers, and explore consciousness studies with AI collaboration.
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Privacy inquiries: <span className="text-indigo-600 dark:text-indigo-400">info@spacechild.love</span>
            </p>
          </section>

          {/* Data Collection */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Database className="w-6 h-6" />
              What We Collect
            </h2>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-purple-600 dark:text-purple-400 mb-3">Research Account Data</h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4">
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Identity:</strong> Name, email, institutional affiliation, ORCID (optional)</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Authentication:</strong> Securely hashed passwords, SSO tokens, wallet addresses</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Research Profile:</strong> Publications, collaborations, expertise areas</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Blockchain Data:</strong> Wallet addresses for paper verification (public by nature)</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-purple-600 dark:text-purple-400 mb-3">Research Content</h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4">
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Papers & Drafts:</strong> Your research documents and collaborative work</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">AI Collaborations:</strong> Interactions with MCP agents for research assistance</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Experiments:</strong> Study designs, protocols, and results</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-purple-600 dark:text-purple-400 mb-3">Automatically Collected</h3>
                <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4">
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Analytics:</strong> Via Google Analytics (geography, behavior, traffic sources)</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Technical:</strong> IP address, browser, device information</li>
                  <li><strong className="text-indigo-600 dark:text-indigo-400">Usage:</strong> Platform interactions, collaboration patterns</li>
                </ul>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg">
                <p className="text-indigo-700 dark:text-indigo-400 font-semibold mb-2 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" />
                  Blockchain Transparency
                </p>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  Paper verification data published to NEO X or Base blockchains is public and immutable by design. This ensures research integrity but means blockchain transactions cannot be deleted.
                </p>
              </div>
            </div>
          </section>

          {/* How We Use Data */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Eye className="w-6 h-6" />
              How We Use Your Data
            </h2>
            
            <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4">
              <li><strong className="text-indigo-600 dark:text-indigo-400">Research Collaboration:</strong> Enable paper co-authoring, peer review, and AI assistance</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Publication:</strong> Blockchain verification of research papers</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Authentication:</strong> Secure access across the Space Child ecosystem</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Platform Improvement:</strong> Analytics to enhance research tools</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Communication:</strong> Research updates, collaboration invites, security alerts</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Compliance:</strong> Meet regulatory and research ethics obligations</li>
            </ul>

            <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 p-4 rounded-lg mt-4">
              <p className="text-purple-700 dark:text-purple-400 font-semibold mb-2">✧ Research Integrity Promise</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                We will <strong>never</strong> sell your research data. We will <strong>never</strong> use your unpublished work without consent. Your intellectual property remains yours.
              </p>
            </div>
          </section>

          {/* Your Rights */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Lock className="w-6 h-6" />
              Your Rights (GDPR, CCPA)
            </h2>
            
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg">
                <h3 className="text-purple-600 dark:text-purple-400 font-semibold mb-2">🔍 Access</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Request copies of your data</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg">
                <h3 className="text-purple-600 dark:text-purple-400 font-semibold mb-2">✏️ Correction</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Update inaccurate information</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg">
                <h3 className="text-purple-600 dark:text-purple-400 font-semibold mb-2">🗑️ Deletion</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Remove your data (except blockchain records)</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg">
                <h3 className="text-purple-600 dark:text-purple-400 font-semibold mb-2">📦 Portability</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm">Export your research data</p>
              </div>
            </div>

            <p className="text-slate-600 dark:text-slate-300 text-sm">
              Contact <span className="text-indigo-600 dark:text-indigo-400">info@spacechild.love</span> to exercise rights. Response within 30 days (GDPR) or 45 days (CCPA).
            </p>
          </section>

          {/* Data Security */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Server className="w-6 h-6" />
              Data Security
            </h2>
            
            <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4">
              <li><strong className="text-indigo-600 dark:text-indigo-400">Encryption:</strong> HTTPS/TLS, encrypted storage, hashed credentials</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Blockchain Verification:</strong> Zero-Knowledge Proofs for privacy-preserving authentication</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Access Controls:</strong> Role-based permissions, audit logging</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Infrastructure:</strong> Secure hosting with Neon Database</li>
            </ul>
          </section>

          {/* Cookie Policy */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Cookie Policy</h2>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              We use essential cookies for authentication and optional analytics cookies. Manage preferences via our cookie banner or browser settings.
            </p>
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              <strong className="text-indigo-600 dark:text-indigo-400">GPC Support:</strong> We honor Global Privacy Control signals as opt-out requests.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 border border-indigo-200 dark:border-indigo-500/30 p-8 rounded-2xl">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Contact Us</h2>
            <p className="text-purple-600 dark:text-purple-400 font-bold text-lg mb-2">Space Child, LLC</p>
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              <strong className="text-indigo-600 dark:text-indigo-400">Email:</strong> info@spacechild.love
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-4">
              Research with integrity. Privacy with purpose. Your data, your rights.
            </p>
          </section>

        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 py-6 text-center text-slate-500 dark:text-slate-400 text-sm">
          <p>© 2026 Space Child, LLC • Research Collective</p>
          <div className="flex justify-center gap-6 mt-2">
            <Link href="/privacy"><a className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy</a></Link>
            <Link href="/terms"><a className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Terms</a></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
