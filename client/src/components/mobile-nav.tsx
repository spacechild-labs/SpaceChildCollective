/**
 * Mobile Navigation Component
 * Provides a mobile-friendly navigation drawer for SpaceChildCollective
 */

import { useState } from "react";
import { Menu, LogIn, LogOut } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { accountNavItems, ledgerNavItems, navItemActive, visibleNavItems } from "@/lib/nav-items";


export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const menuItems = visibleNavItems(ledgerNavItems, user);
  const bottomItems = visibleNavItems(accountNavItems, user);

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
                    navItemActive(item.url, location)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
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
                    navItemActive(item.url, location)
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.title}</span>
                </Link>
              ))}
              {user ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground w-[calc(100%-16px)]"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              ) : (
                <Link
                  href="/auth"
                  onClick={handleNavClick}
                  className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Sign in</span>
                </Link>
              )}
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
