import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import Landing from "@/pages/landing";
import Auth from "@/pages/auth";
import Workspace from "@/pages/workspace";
import Discover from "@/pages/discover";
import PaperEditor from "@/pages/paper-editor";
import McpStatus from "@/pages/mcp-status";
import Papers from "@/pages/papers";
import Agents from "@/pages/agents";
import Approvals from "@/pages/approvals";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import SEODemo from "@/pages/seo-demo";
import NotFound from "@/pages/not-found";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi-config";
import { AuthProvider } from "@/contexts/auth-context";
import { useAnalytics } from "@/hooks/use-analytics";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={Auth} />
      <Route path="/workspace" component={Workspace} />
      <Route path="/discover" component={Discover} />
      <Route path="/mcp" component={McpStatus} />
      <Route path="/papers/new" component={PaperEditor} />
      <Route path="/papers/:id/edit" component={PaperEditor} />
      <Route path="/papers/:id" component={PaperEditor} />
      <Route path="/papers" component={Papers} />
      <Route path="/agents" component={Agents} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/profile" component={Profile} />
      <Route path="/settings" component={Settings} />
      <Route path="/seo-demo" component={SEODemo} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Routes that should show sidebar (authenticated routes only)
const sidebarRoutes = ["/workspace", "/discover", "/papers", "/profile", "/settings", "/agents", "/mcp", "/approvals"];

function AppContent() {
  const [location] = useLocation();
  
  // Track page views for analytics
  useAnalytics();
  
  // Check if current route should show sidebar
  const showSidebar = sidebarRoutes.some(route => location.startsWith(route));

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <>
      {showSidebar ? (
        <SidebarProvider style={sidebarStyle as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <main className="flex-1 overflow-auto">
              <Router />
            </main>
          </div>
        </SidebarProvider>
      ) : (
        <Router />
      )}
      <Toaster />
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
            </TooltipProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
