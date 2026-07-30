// ============================================================================
// iBetPro Session Helper
// Provides authenticated user context for API routes
// ============================================================================

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Get the current authenticated user from the session
 * Returns null if not authenticated
 */
export async function getAuthUser(): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
} | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return null;
  }

  const user = session.user as { id: string; email: string; name: string; role: string };

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

/**
 * Get the authenticated user's ID
 * Throws if not authenticated
 */
export async function requireAuth(): Promise<string> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user.id;
}

/**
 * Get the authenticated user with full database record
 */
export async function getAuthUserFull() {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: { settings: true },
  });

  return user;
}

/**
 * Check if the current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getAuthUser();
  return user?.role === "admin";
}
