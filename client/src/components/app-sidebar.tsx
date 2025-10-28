import { Home, FileText, Search, User, Settings, Bot, Network, CheckCircle2, LogOut } from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import type { AgentTask } from "@shared/schema";

const menuItems = [
  {
    title: "Home",
    url: "/workspace",
    icon: Home,
    testId: "nav-home",
  },
  {
    title: "My Papers",
    url: "/papers",
    icon: FileText,
    testId: "nav-papers",
  },
  {
    title: "Discover",
    url: "/discover",
    icon: Search,
    testId: "nav-discover",
  },
  {
    title: "Agents",
    url: "/agents",
    icon: Bot,
    testId: "nav-agents",
  },
  {
    title: "Approvals",
    url: "/approvals",
    icon: CheckCircle2,
    testId: "nav-approvals",
    showBadge: true,
  },
  {
    title: "MCP Status",
    url: "/mcp",
    icon: Network,
    testId: "nav-mcp",
  },
];

const bottomItems = [
  {
    title: "Profile",
    url: "/profile",
    icon: User,
    testId: "nav-profile",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    testId: "nav-settings",
  },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const { toast } = useToast();

  // Get count of pending approvals
  const { data: pendingTasks } = useQuery<AgentTask[]>({
    queryKey: ["/api/tasks/pending-approvals"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const pendingCount = pendingTasks?.length || 0;

  const handleLogout = () => {
    logout();
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
    setLocation("/");
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">SCRC</h2>
          <ThemeToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link href={item.url} data-testid={item.testId}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      {item.showBadge && pendingCount > 0 && (
                        <Badge 
                          variant="default" 
                          className="ml-auto h-5 px-1.5 text-xs"
                          data-testid="badge-pending-approvals"
                        >
                          {pendingCount}
                        </Badge>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <SidebarMenu>
          {bottomItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={location === item.url}>
                <Link href={item.url} data-testid={item.testId}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} data-testid="button-logout">
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
