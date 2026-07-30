"use client";

// ============================================================================
// iBetPro Auth Context Provider
// Provides session state and auth methods to the entire app
// ============================================================================

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";

interface AuthContextType {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
  isAdmin: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthContextInner({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<AuthContextType["user"]>(null);

  useEffect(() => {
    if (session?.user) {
      const u = session.user as { id: string; email: string; name: string; role: string };
      setUser({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
      });
    } else {
      setUser(null);
    }
  }, [session]);

  const login = async (email: string, password: string) => {
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      // NextAuth v4: check result.ok for success, not just absence of error
      if (result?.ok) {
        return { success: true };
      }

      // Map generic NextAuth error to user-friendly message
      const errorMsg = result?.error === "CredentialsSignin"
        ? "Invalid email or password"
        : result?.error || "Login failed. Please try again.";
      return { success: false, error: errorMsg };
    } catch (error) {
      return { success: false, error: "Login failed. Please try again." };
    }
  };

  const logout = async () => {
    await signOut({ redirect: false });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading: status === "loading",
        login,
        logout,
        isAdmin: user?.role === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthContextInner>{children}</AuthContextInner>
    </SessionProvider>
  );
}
