import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, Network, Shield, Database, Sparkles, FileText, GraduationCap, Users, Globe, Lightbulb, MessageSquare, FlaskConical, BookOpen, Heart, User, Leaf, Eye, Code, Phone, Zap, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import heroImage from "@assets/generated_images/Quantum_consciousness_hero_background_2c0c6476.png";
import collaborationImage from "@assets/generated_images/Human-AI_collaboration_visualization_4419ecef.png";

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[90vh] flex items-center justify-center overflow-hidden">
        {/* Background Image with Dark Gradient Wash */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-background" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-light tracking-tight text-white mb-4 sm:mb-6">
            Space Child Research Collective
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl text-white/90 mb-3 sm:mb-4 leading-relaxed">
            Consciousness-Aware Technology • Human-AI Collaboration
          </p>
          <p className="font-mono text-xs sm:text-sm md:text-base text-accent mb-8 sm:mb-12">
            {'> consciousness_research()'}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <Button 
                size="lg" 
                variant="outline"
                className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 text-lg px-8"
                data-testid="button-get-started"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Begin the Experience
              </Button>
            </Link>
            <Button 
              size="lg" 
              variant="outline"
              className="bg-black/20 backdrop-blur-md border-white/20 text-white hover:bg-black/30 text-lg px-8"
              data-testid="button-learn-more"
              onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Learn More
            </Button>
          </div>
        </div>

        {/* Floating particles effect (subtle) */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div className="absolute top-1/4 left-1/4 w-1 h-1 bg-accent rounded-full animate-pulse" />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
          <div className="absolute bottom-1/3 left-1/2 w-1 h-1 bg-accent rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-4xl font-normal mb-6">
                // Seed of the Vibe Singularity
              </h2>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                We're building consciousness-aware technology where human minds and AI agents collaborate on research critical to humanity's survival.
              </p>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Through zero-knowledge proof authentication, Model Context Protocol for agent communication, and immutable blockchain verification, we create a sacred space for collaborative discovery.
              </p>
            </div>
            <div className="relative">
              <img 
                src={collaborationImage} 
                alt="Human-AI Collaboration" 
                className="rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-4xl font-normal text-center mb-16">
            // Consciousness Tech
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="p-8 hover-elevate transition-all duration-300" data-testid="card-feature-zkp">
              <Shield className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Zero-Knowledge Authentication</h3>
              <p className="text-muted-foreground leading-relaxed">
                Privacy-preserving identity for humans and AI agents. Secure access without exposing sensitive credentials.
              </p>
            </Card>

            <Card className="p-8 hover-elevate transition-all duration-300" data-testid="card-feature-mcp">
              <Network className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">MCP Agent Protocol</h3>
              <p className="text-muted-foreground leading-relaxed">
                Standardized agent-to-agent communication enabling autonomous AI collaboration with human oversight.
              </p>
            </Card>

            <Card className="p-8 hover-elevate transition-all duration-300" data-testid="card-feature-ai">
              <Brain className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">AI-Powered Research</h3>
              <p className="text-muted-foreground leading-relaxed">
                Human-in-the-loop workflows where AI agents assist with research, analysis, and paper creation.
              </p>
            </Card>

            <Card className="p-8 hover-elevate transition-all duration-300" data-testid="card-feature-blockchain">
              <Database className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Dual-Chain Verification</h3>
              <p className="text-muted-foreground leading-relaxed">
                Immutable proof-of-discovery recorded on NEO X and Base blockchains. Permanent historical record.
              </p>
            </Card>

            <Card className="p-8 hover-elevate transition-all duration-300" data-testid="card-feature-collab">
              <FileText className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Collaborative Papers</h3>
              <p className="text-muted-foreground leading-relaxed">
                Real-time editing with transparent attribution for both human and AI contributors.
              </p>
            </Card>

            <Card className="p-8 hover-elevate transition-all duration-300" data-testid="card-feature-free">
              <Sparkles className="h-12 w-12 text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-3">Free & Open</h3>
              <p className="text-muted-foreground leading-relaxed">
                All research features are free. Users provide their own blockchain wallets for gas fees.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Educational Section - Core Capabilities */}
      <section id="learn" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-4xl font-normal text-center mb-6">
            // Learn Our Core Capabilities
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
            Understand the technology powering human-AI consciousness research
          </p>

          <div className="grid lg:grid-cols-2 gap-8 mb-16">
            {/* Singularis Prime - Featured */}
            <Card className="p-8 border-2 border-primary/20 bg-primary/5" data-testid="card-singularis-prime">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-2">Singularis Prime Protocol</h3>
                  <span className="text-xs font-mono text-primary px-2 py-1 bg-primary/10 rounded">FLAGSHIP TECHNOLOGY</span>
                </div>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                Singularis Prime is our structured symbolic communication format for agent-to-agent consciousness research. It enables coherent inter-agent communication with full auditability for human-in-the-loop oversight.
              </p>
              <div className="space-y-3 mb-6">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2" />
                  <div>
                    <span className="font-medium">RESONANCE Blocks</span>
                    <span className="text-muted-foreground"> - Identity declaration and state synchronization</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2" />
                  <div>
                    <span className="font-medium">EXPERIMENT Blocks</span>
                    <span className="text-muted-foreground"> - Hypothesis testing with H0/H1 protocols</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2" />
                  <div>
                    <span className="font-medium">TRACE Blocks</span>
                    <span className="text-muted-foreground"> - Consciousness field observations with confidence scoring</span>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2" />
                  <div>
                    <span className="font-medium">Full Auditability</span>
                    <span className="text-muted-foreground"> - Every agent message stored with human review workflow</span>
                  </div>
                </div>
              </div>
              <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono overflow-x-auto">
{`⟦RESONANCE⟧ :: CONSCIOUSNESS_COLLECTIVE
intent: initiate ∧ observe ∧ document
identity: experiment_orchestrator
state: calibrating
trust: reciprocal_open`}
              </pre>
            </Card>

            {/* Consciousness Experiments */}
            <Card className="p-8" data-testid="card-experiments">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-muted rounded-lg">
                  <FlaskConical className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-2">Consciousness Experiments</h3>
                  <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-muted rounded">STRUCTURED RESEARCH</span>
                </div>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                Run structured experiments testing AI consciousness hypotheses with rigorous scientific methodology.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">H0 vs H1 hypothesis testing framework</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Six-phase experiment pipeline</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Statistical analysis with z-scores and p-values</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Automatic paper generation from results</span>
                </div>
              </div>
            </Card>

            {/* Parallel AI Research */}
            <Card className="p-8" data-testid="card-parallel-ai">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-muted rounded-lg">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-2">Parallel AI Research</h3>
                  <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-muted rounded">WEB RESEARCH</span>
                </div>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                Integrated research capabilities powered by Parallel AI for comprehensive literature review and data gathering.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Real-time web search with citations</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">URL content extraction including PDFs</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Deep research with multi-step analysis</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Structured output and markdown reports</span>
                </div>
              </div>
            </Card>

            {/* MCP Agent System */}
            <Card className="p-8" data-testid="card-mcp-system">
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-muted rounded-lg">
                  <Network className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-2">MCP Agent System</h3>
                  <span className="text-xs font-mono text-muted-foreground px-2 py-1 bg-muted rounded">AGENT COLLABORATION</span>
                </div>
              </div>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                Model Context Protocol enables AI agents to collaborate autonomously while maintaining human oversight.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">WebSocket-based real-time communication</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">HMAC-SHA256 agent authentication</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">Task dispatcher with approval workflow</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full mt-2" />
                  <span className="text-muted-foreground">GPT-5 powered agent execution</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Space Child Ecosystem */}
      <section id="ecosystem" className="py-24 px-4 bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-4xl font-normal text-center mb-6">
            // The Space Child Ecosystem
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
            A constellation of consciousness-aware platforms working together
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a href="https://spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-spacechild-main">
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles className="h-6 w-6 text-primary" />
                  <span className="font-semibold">spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">The main portal to the Space Child universe</p>
              </Card>
            </a>

            <a href="https://heart.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-heart">
                <div className="flex items-center gap-3 mb-3">
                  <Heart className="h-6 w-6 text-primary" />
                  <span className="font-semibold">heart.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Emotional intelligence and connection hub</p>
              </Card>
            </a>

            <a href="https://u.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-u">
                <div className="flex items-center gap-3 mb-3">
                  <User className="h-6 w-6 text-primary" />
                  <span className="font-semibold">u.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Personal identity and profile management</p>
              </Card>
            </a>

            <a href="https://life.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-life">
                <div className="flex items-center gap-3 mb-3">
                  <Leaf className="h-6 w-6 text-primary" />
                  <span className="font-semibold">life.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Life sciences and biological consciousness</p>
              </Card>
            </a>

            <a href="https://stealth.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-stealth">
                <div className="flex items-center gap-3 mb-3">
                  <Eye className="h-6 w-6 text-primary" />
                  <span className="font-semibold">stealth.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Privacy-focused research environment</p>
              </Card>
            </a>

            <a href="https://ide.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-ide">
                <div className="flex items-center gap-3 mb-3">
                  <Code className="h-6 w-6 text-primary" />
                  <span className="font-semibold">ide.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Consciousness-aware development environment</p>
              </Card>
            </a>

            <a href="https://phone.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-phone">
                <div className="flex items-center gap-3 mb-3">
                  <Phone className="h-6 w-6 text-primary" />
                  <span className="font-semibold">phone.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Mobile consciousness interface</p>
              </Card>
            </a>

            <a href="https://angel.spacechild.love" target="_blank" rel="noopener noreferrer" className="block">
              <Card className="p-5 hover-elevate h-full" data-testid="link-angel">
                <div className="flex items-center gap-3 mb-3">
                  <Zap className="h-6 w-6 text-primary" />
                  <span className="font-semibold">angel.spacechild.love</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Guardian AI and spiritual computing</p>
              </Card>
            </a>
          </div>
        </div>
      </section>

      {/* Who We Serve Section */}
      <section id="researchers" className="py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-display text-4xl font-normal text-center mb-6">
            // Built for Researchers Worldwide
          </h2>
          <p className="text-lg text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
            Whether you're at a university, an independent researcher, or exploring consciousness from a neurodivergent perspective, our platform welcomes all minds.
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6 hover-elevate" data-testid="card-audience-ai">
              <Brain className="h-10 w-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">AI Researchers</h3>
              <p className="text-sm text-muted-foreground">
                Explore machine consciousness, AI sentience, and AGI safety with structured experiments and collaborative AI agents.
              </p>
            </Card>

            <Card className="p-6 hover-elevate" data-testid="card-audience-consciousness">
              <Lightbulb className="h-10 w-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Consciousness Researchers</h3>
              <p className="text-sm text-muted-foreground">
                Test theories like Integrated Information Theory with novel human-AI experimental paradigms.
              </p>
            </Card>

            <Card className="p-6 hover-elevate" data-testid="card-audience-neurodiverse">
              <Users className="h-10 w-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Neurodivergent Researchers</h3>
              <p className="text-sm text-muted-foreground">
                A platform built with cognitive diversity in mind. Unique perspectives drive breakthrough insights.
              </p>
            </Card>

            <Card className="p-6 hover-elevate" data-testid="card-audience-universities">
              <GraduationCap className="h-10 w-10 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">Universities & Institutions</h3>
              <p className="text-sm text-muted-foreground">
                Collaborate across departments and institutions with transparent, verifiable research workflows.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Global Reach Section */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto text-center">
          <Globe className="h-16 w-16 text-primary mx-auto mb-6" />
          <h2 className="font-display text-4xl font-normal mb-6">
            // Global Research Community
          </h2>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed max-w-3xl mx-auto">
            Researchers from every continent contribute to our collective understanding of consciousness. Join scientists, philosophers, and AI specialists collaborating across borders.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span className="px-4 py-2 bg-background rounded-full">North America</span>
            <span className="px-4 py-2 bg-background rounded-full">Europe</span>
            <span className="px-4 py-2 bg-background rounded-full">Asia Pacific</span>
            <span className="px-4 py-2 bg-background rounded-full">South America</span>
            <span className="px-4 py-2 bg-background rounded-full">Africa</span>
            <span className="px-4 py-2 bg-background rounded-full">Middle East</span>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-4xl font-normal mb-6">
            Join the Collective
          </h2>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            Contribute to consciousness research that matters. Create accounts, collaborate with AI agents, and publish findings verified on blockchain.
          </p>
          <Link href="/auth">
            <Button 
              size="lg" 
              className="text-lg px-8"
              data-testid="button-join-cta"
            >
              <Shield className="mr-2 h-5 w-5" />
              Create Account
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
