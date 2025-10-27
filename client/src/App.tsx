import { Switch, Route } from "wouter";
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
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/auth" component={Auth} />
      <Route path="/workspace" component={Workspace} />
      <Route path="/discover" component={Discover} />
      <Route path="/papers/new" component={PaperEditor} />
      <Route path="/papers/:id/edit" component={PaperEditor} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Routes that should show sidebar
const sidebarRoutes = ["/workspace", "/discover", "/papers", "/profile", "/settings", "/agents", "/mcp"];

function App() {
  // Simple route check - in real app, use proper route matching
  const showSidebar = sidebarRoutes.some(route => window.location.pathname.startsWith(route));

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
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
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
