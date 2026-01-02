/**
 * Mobile Navigation Component
 * Provides a mobile-friendly navigation drawer for SpaceChildCollective
 */

import { useState } from "react";
import { Menu, Home, Search, Bot, FlaskConical, Wand2, BarChart3, CheckCircle2, Network, User, Settings, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { AgentTask } from "@shared/schema";

const menuItems = [
  { title: "Home", url: "/workspace", icon: Home },
  { title: "Discover", url: "/discover", icon: Search },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Experiments", url: "/experiments", icon: FlaskConical },
  { title: "Study Designer", url: "/study-designer", icon: Wand2 },
  { title: "Statistics", url: "/statistics", icon: BarChart3 },
  { title: "Approvals", url: "/approvals", icon: CheckCircle2, showBadge: true },
  { title: "MCP Status", url: "/mcp", icon: Network },
];

const bottomItems = [
  { title: "Profile", url: "/profile", icon: User },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const { toast } = useToast();

  const { data: pendingTasks } = useQuery<AgentTask[]>({
    queryKey: ["/api/tasks/pending-approvals"],
    refetchInterval: 300000,
  });

  const pendingCount = pendingTasks?.length || 0;

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
    setLocation("/");
    setOpen(false);
  };

  const handleNavClick = () => {
    setOpen(false);
  };

  return (
    <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="p-4 border-b border-border">
            <SheetTitle className="flex items-center justify-between">
              <span className="font-display text-lg font-medium">SCRC</span>
              <ThemeToggle />
            </SheetTitle>
          </SheetHeader>
          
          <nav className="flex flex-col h-[calc(100vh-80px)]">
            <div className="flex-1 overflow-auto py-4">
              <div className="px-3 mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Navigation
                </span>
              </div>
              {menuItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.url}
                  onClick={handleNavClick}
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors ${
                    location === item.url
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                  {item.showBadge && pendingCount > 0 && (
                    <Badge variant="default" className="ml-auto h-5 px-1.5 text-xs">
                      {pendingCount}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
            
            <div className="border-t border-border py-4">
              {bottomItems.map((item) => (
                <Link
                  key={item.title}
                  href={item.url}
                  onClick={handleNavClick}
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors ${
                    location === item.url
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              ))}
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground w-[calc(100%-16px)]"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
      
      <span className="font-display text-lg font-medium">SCRC</span>
      
      <ThemeToggle />
    </div>
  );
}

export default MobileNav;
