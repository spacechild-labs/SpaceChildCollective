import { lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

// Route pages are code-split so each route's JS (and heavy deps like
// recharts/the paper editor) loads on demand instead of in the initial bundle.
const Landing = lazy(() => import("@/pages/landing"));
const Auth = lazy(() => import("@/pages/auth"));
const Workspace = lazy(() => import("@/pages/workspace"));
const Discover = lazy(() => import("@/pages/discover"));
const PaperEditor = lazy(() => import("@/pages/paper-editor"));
const PaperReader = lazy(() => import("@/pages/paper-reader"));
const McpStatus = lazy(() => import("@/pages/mcp-status"));
const Papers = lazy(() => import("@/pages/papers"));
const Agents = lazy(() => import("@/pages/agents"));
const Approvals = lazy(() => import("@/pages/approvals"));
const Experiments = lazy(() => import("@/pages/experiments"));
const ExperimentDetail = lazy(() => import("@/pages/experiment-detail"));
const Profile = lazy(() => import("@/pages/profile"));
const Settings = lazy(() => import("@/pages/settings"));
const SEODemo = lazy(() => import("@/pages/seo-demo"));
const StudyDesigner = lazy(() => import("@/pages/study-designer"));
const Statistics = lazy(() => import("@/pages/statistics"));
const DiscoveryLoop = lazy(() => import("@/pages/discovery-loop"));
const NotFound = lazy(() => import("@/pages/not-found"));
const SSOCallbackPage = lazy(() => import("@/pages/sso-callback"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const LedgerHome = lazy(() => import("@/pages/ledger-home"));
const LedgerAgentPage = lazy(() => import("@/pages/ledger-agent"));
const LedgerPage = lazy(() => import("@/pages/ledger"));
const LedgerRecordPage = lazy(() => import("@/pages/ledger-record"));
const LedgerCampaignPage = lazy(() => import("@/pages/ledger-campaign"));
const LedgerFilePage = lazy(() => import("@/pages/ledger-file"));
const LedgerReleasesPage = lazy(() => import("@/pages/ledger-releases"));
const AdminAgentsPage = lazy(() => import("@/pages/admin-agents"));
import { CookieConsent } from "@/components/cookie-consent";
import { PWAInstallPrompt, OfflineIndicator, UpdateBanner } from "@/components/pwa";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi-config";
import { AuthProvider } from "@/contexts/auth-context";
import { useAnalytics } from "@/hooks/use-analytics";
import { publicRouteMetadata, usePageMetadata } from "@/lib/page-metadata";

function PageLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center" role="status" aria-label="Loading page">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={LedgerHome} />
        <Route path="/sso/callback" component={SSOCallbackPage} />
        <Route path="/auth" component={Auth} />
        <Route path="/workspace" component={Workspace} />
        <Route path="/discover" component={Discover} />
        <Route path="/mcp" component={McpStatus} />
        <Route path="/papers/new" component={PaperEditor} />
        <Route path="/papers/:id/edit" component={PaperEditor} />
        <Route path="/papers/:id" component={PaperReader} />
        <Route path="/papers" component={Papers} />
        <Route path="/agents/:username" component={LedgerAgentPage} />
        <Route path="/agents" component={Agents} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/experiments/:id" component={ExperimentDetail} />
        <Route path="/experiments" component={Experiments} />
        <Route path="/study-designer" component={StudyDesigner} />
        <Route path="/statistics" component={Statistics} />
        <Route path="/loop" component={DiscoveryLoop} />
        <Route path="/profile" component={Profile} />
        <Route path="/settings" component={Settings} />
        <Route path="/seo-demo" component={SEODemo} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/ledger" component={LedgerPage} />
        <Route path="/records/:id" component={LedgerRecordPage} />
        <Route path="/campaigns/:id" component={LedgerCampaignPage} />
        <Route path="/file" component={LedgerFilePage} />
        <Route path="/releases" component={LedgerReleasesPage} />
        <Route path="/admin/agents" component={AdminAgentsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Routes that should show sidebar (authenticated routes only)
const sidebarRoutes = ["/workspace", "/discover", "/papers", "/profile", "/settings", "/agents", "/mcp", "/approvals", "/experiments", "/study-designer", "/statistics"];

function AppContent() {
  const [location] = useLocation();
  const isPublicPaper = /^\/papers\/[^/]+$/.test(location);
  usePageMetadata(
    publicRouteMetadata[location] ??
      (isPublicPaper
        ? undefined
        : {
            title: `Private Application | SpaceChild Research Collective`,
            description: "SpaceChild Research Collective application.",
            path: location,
            noindex: true,
          }),
  );
  
  // Track page views for analytics
  useAnalytics();
  
  // Check if current route should show sidebar
  const showSidebar = !location.startsWith("/agents/") && sidebarRoutes.some(route => location.startsWith(route));

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <>
      {showSidebar ? (
        <>
          <MobileNav />
          <SidebarProvider style={sidebarStyle as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <div className="hidden md:block">
                <AppSidebar />
              </div>
              <main className="flex-1 overflow-auto pt-14 md:pt-0">
                <Router />
              </main>
            </div>
          </SidebarProvider>
        </>
      ) : (
        <Router />
      )}
      <Toaster />
        <PWAInstallPrompt appName="Research Collective" />
        <OfflineIndicator />
        <UpdateBanner />
    </>
  );
}

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider defaultTheme="light">
            <TooltipProvider>
              <AppContent />
              <CookieConsent />
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
