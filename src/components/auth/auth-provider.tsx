"use client";

import { createContext, useContext, useEffect, useRef, ReactNode } from "react";
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
  const botInitializedForUserRef = useRef<string | null>(null);

  const sessionUser = session?.user as
    | { id?: string; email?: string | null; name?: string | null; role?: string }
    | undefined;

  const user =
    sessionUser?.id && sessionUser.email
      ? {
          id: sessionUser.id,
          email: sessionUser.email,
          name: sessionUser.name || "",
          role: sessionUser.role || "user",
        }
      : null;

  useEffect(() => {
    if (!user?.id) {
      botInitializedForUserRef.current = null;
      return;
    }

    if (botInitializedForUserRef.current === user.id) return;
    botInitializedForUserRef.current = user.id;

    fetch("/api/bot/init").catch(() => {
      if (botInitializedForUserRef.current === user.id) {
        botInitializedForUserRef.current = null;
      }
    });
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.ok) {
        return { success: true };
      }

      const errorMsg =
        result?.error === "CredentialsSignin"
          ? "Invalid email or password"
          : result?.error || "Login failed. Please try again.";
      return { success: false, error: errorMsg };
    } catch {
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
