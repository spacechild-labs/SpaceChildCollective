import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Brain, Network, Shield, Database, Sparkles, FileText } from "lucide-react";
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
