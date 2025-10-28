import { Home, FileText, Search, User, Settings, Bot, Network } from "lucide-react";
import { Link, useLocation } from "wouter";
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
import { ThemeToggle } from "./theme-toggle";

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
  const [location] = useLocation();

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
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
