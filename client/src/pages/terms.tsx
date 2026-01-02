import { motion } from "framer-motion";
import { Scale, AlertTriangle, Shield, Zap, Heart, FlaskConical, Users, Code, Ban } from "lucide-react";
import { Link } from "wouter";

export default function TermsPage() {
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
            <Link href="/privacy">
              <a className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Privacy</a>
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
              <Scale className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Terms of Service
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Research Collaboration Agreement
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Last Updated: January 2, 2026
            </p>
          </div>

          {/* Introduction */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <div className="flex items-start gap-4">
              <Heart className="w-6 h-6 text-purple-500 mt-1 flex-shrink-0" />
              <div>
                <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Welcome to the Collective</h2>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
                  These Terms of Service govern your participation in SpaceChild Research Collective—a revolutionary platform for consciousness research, human-AI collaboration, and blockchain-verified academic publishing.
                </p>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                  By joining the Collective, you agree to these Terms. They're designed to protect both researchers and the integrity of our shared scientific endeavor.
                </p>
              </div>
            </div>
          </section>

          {/* Acceptance */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Users className="w-6 h-6" />
              Acceptance of Terms
            </h2>
            
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              By accessing SpaceChild Research Collective, you enter into an agreement with <strong className="text-purple-600 dark:text-purple-400">Space Child, LLC</strong>. This includes:
            </p>

            <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4 mb-4">
              <li>These Terms of Service</li>
              <li>Our Privacy Policy</li>
              <li>Research ethics guidelines</li>
              <li>Blockchain publication terms</li>
            </ul>

            <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 p-4 rounded-lg">
              <p className="text-purple-700 dark:text-purple-400 font-semibold mb-2">⚡ Age Requirement</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                You must be 18+ to publish research or 13+ (16+ EU) to participate in other platform features.
              </p>
            </div>
          </section>

          {/* Research Platform */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Code className="w-6 h-6" />
              Platform Services
            </h2>
            
            <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4">
              <li><strong className="text-indigo-600 dark:text-indigo-400">Paper Creation:</strong> Write and collaborate on research documents</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">AI Collaboration:</strong> MCP agents assist with research tasks</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Blockchain Verification:</strong> Publish to NEO X or Base for immutable proof</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Peer Review:</strong> Community-driven research validation</li>
              <li><strong className="text-indigo-600 dark:text-indigo-400">Study Designer:</strong> Create and manage research experiments</li>
            </ul>

            <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 p-4 rounded-lg mt-4">
              <p className="text-indigo-700 dark:text-indigo-400 font-semibold mb-2">🔬 Research Integrity</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                All published research becomes part of the permanent scientific record. Blockchain publications cannot be deleted—only retracted with notice.
              </p>
            </div>
          </section>

          {/* User Responsibilities */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Shield className="w-6 h-6" />
              Researcher Responsibilities
            </h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-2">Research Ethics</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  Uphold scientific integrity. No fabrication, falsification, or plagiarism. Properly cite sources and acknowledge collaborators.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-2">Account Security</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  Protect your credentials. Your wallet addresses and publications are linked to your identity for attribution.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-2">Collaboration Conduct</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  Treat fellow researchers with respect. Engage constructively in peer review and discussions.
                </p>
              </div>
            </div>
          </section>

          {/* Prohibited Conduct */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <Ban className="w-6 h-6" />
              Prohibited Conduct
            </h2>
            
            <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4 text-sm">
              <li><strong className="text-purple-600 dark:text-purple-400">Research Misconduct:</strong> Fabrication, falsification, plagiarism</li>
              <li><strong className="text-purple-600 dark:text-purple-400">Blockchain Fraud:</strong> Manipulating verification systems</li>
              <li><strong className="text-purple-600 dark:text-purple-400">AI Misuse:</strong> Using AI agents to generate fraudulent content</li>
              <li><strong className="text-purple-600 dark:text-purple-400">Harassment:</strong> Abusing peer review or targeting researchers</li>
              <li><strong className="text-purple-600 dark:text-purple-400">Data Theft:</strong> Unauthorized access to others' research</li>
              <li><strong className="text-purple-600 dark:text-purple-400">System Abuse:</strong> Attempting to compromise platform security</li>
            </ul>

            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-400/30 p-4 rounded-lg mt-4">
              <p className="text-red-600 dark:text-red-400 font-semibold mb-2">⚠️ Consequences</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                Violations result in account termination, public retraction notices on blockchain publications, and potential legal action.
              </p>
            </div>
          </section>

          {/* Intellectual Property */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Intellectual Property</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-2">Your Research</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  You retain ownership of your research and intellectual property. Publishing grants the platform a license to display and distribute your work as part of the research record.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-purple-600 dark:text-purple-400 mb-2">Platform IP</h3>
                <p className="text-slate-600 dark:text-slate-300 text-sm">
                  SpaceChild Research Collective's platform, tools, and branding are owned by Space Child, LLC. You may not reproduce or redistribute platform technology.
                </p>
              </div>
            </div>
          </section>

          {/* Disclaimers */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              Disclaimers
            </h2>
            
            <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-400/30 p-4 rounded-lg mb-4">
              <p className="text-yellow-700 dark:text-yellow-400 text-sm">
                Platform provided "AS IS" without warranties. We don't guarantee research accuracy, blockchain availability, or uninterrupted service.
              </p>
            </div>

            <ul className="list-disc list-inside text-slate-600 dark:text-slate-300 space-y-2 ml-4 text-sm">
              <li>AI agents provide assistance, not professional research advice</li>
              <li>Blockchain transactions are final and cannot be reversed</li>
              <li>Peer review reflects community opinions, not official endorsement</li>
            </ul>
          </section>

          {/* Limitation of Liability */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Limitation of Liability</h2>
            
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              To the maximum extent permitted by law, Space Child, LLC is not liable for indirect, incidental, or consequential damages including loss of research data, reputation harm, or blockchain transaction costs.
            </p>
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              Total liability limited to $100 or amounts paid in the last 12 months.
            </p>
          </section>

          {/* Dispute Resolution */}
          <section className="mb-10 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-8 rounded-2xl shadow-sm">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Dispute Resolution</h2>
            
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              Contact <span className="text-indigo-600 dark:text-indigo-400">info@spacechild.love</span> first for informal resolution. Unresolved disputes subject to binding arbitration under AAA rules. Governed by Delaware law. Class action waiver applies.
            </p>
          </section>

          {/* Contact */}
          <section className="mb-10 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 border border-indigo-200 dark:border-indigo-500/30 p-8 rounded-2xl">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-4">Contact</h2>
            <p className="text-purple-600 dark:text-purple-400 font-bold text-lg mb-2">Space Child, LLC</p>
            <p className="text-slate-600 dark:text-slate-300 text-sm">
              <strong className="text-indigo-600 dark:text-indigo-400">Email:</strong> info@spacechild.love
            </p>
          </section>

          {/* Closing */}
          <section className="bg-white dark:bg-slate-800/50 border border-indigo-200 dark:border-indigo-500/30 p-8 rounded-2xl text-center">
            <Zap className="w-12 h-12 mx-auto text-purple-500 mb-4" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
              Research with Integrity
            </h2>
            <p className="text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              These Terms protect the scientific integrity of our collective endeavor. Together, we're building the future of human-AI research collaboration.
            </p>
          </section>

        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="container mx-auto px-4 py-6 text-center text-slate-500 text-sm">
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
