import { useEffect } from "react";
import { useLocation } from "wouter";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    trackEvent?: (eventName: string, eventParams?: Record<string, any>) => void;
    trackPageView?: (pagePath: string, pageTitle?: string) => void;
    trackEngagement?: (engagementType: string, details?: string) => void;
  }
}

export function useAnalytics() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window !== "undefined" && window.trackPageView) {
      const pageTitle = getPageTitle(location);
      window.trackPageView(location, pageTitle);
    }
  }, [location]);

  return {
    trackEvent: (eventName: string, params?: Record<string, any>) => {
      if (typeof window !== "undefined" && window.trackEvent) {
        window.trackEvent(eventName, params);
      }
    },
    trackEngagement: (type: string, details?: string) => {
      if (typeof window !== "undefined" && window.trackEngagement) {
        window.trackEngagement(type, details);
      }
    },
  };
}

function getPageTitle(path: string): string {
  const titles: Record<string, string> = {
    "/": "Home - SpaceChild Research Collective",
    "/auth": "Login - SpaceChild Research Collective",
    "/workspace": "Workspace - SpaceChild Research Collective",
    "/discover": "Discover - SpaceChild Research Collective",
    "/papers": "Papers - SpaceChild Research Collective",
    "/agents": "AI Agents - SpaceChild Research Collective",
    "/approvals": "Approvals - SpaceChild Research Collective",
    "/profile": "Profile - SpaceChild Research Collective",
    "/settings": "Settings - SpaceChild Research Collective",
    "/mcp": "MCP Status - SpaceChild Research Collective",
  };

  if (path.startsWith("/papers/")) {
    return "Paper Editor - SpaceChild Research Collective";
  }

  return titles[path] || "SpaceChild Research Collective";
}

export function trackButtonClick(buttonName: string, context?: string) {
  if (typeof window !== "undefined" && window.trackEvent) {
    window.trackEvent("button_click", {
      button_name: buttonName,
      context: context || "general",
    });
  }
}

export function trackFormSubmit(formName: string, success: boolean) {
  if (typeof window !== "undefined" && window.trackEvent) {
    window.trackEvent("form_submit", {
      form_name: formName,
      success: success,
    });
  }
}

export function trackResearchAction(action: string, paperId?: string) {
  if (typeof window !== "undefined" && window.trackEvent) {
    window.trackEvent("research_action", {
      action: action,
      paper_id: paperId,
    });
  }
}

export function trackBlockchainVerification(chain: string, status: string) {
  if (typeof window !== "undefined" && window.trackEvent) {
    window.trackEvent("blockchain_verification", {
      chain: chain,
      status: status,
    });
  }
}
