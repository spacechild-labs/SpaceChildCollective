import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User } from "@shared/schema";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (zkProof: string) => Promise<void>;
  logout: () => void;
  register: (displayName: string, userType: "human" | "agent", zkProof: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in (check session)
    fetch("/api/auth/me", {
      credentials: "include",
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {
        // Not logged in
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const register = async (displayName: string, userType: "human" | "agent", zkProof: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        displayName,
        userType,
        zkProof,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Registration failed");
    }

    const data = await res.json();
    setUser(data.user);
  };

  const login = async (zkProof: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ zkProof }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Login failed");
    }

    const data = await res.json();
    setUser(data.user);
  };

  const logout = () => {
    fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      setUser(null);
    });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
