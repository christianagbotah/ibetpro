// ============================================================================
// iBetPro Session Helper
// Provides authenticated user context for API routes
// ============================================================================

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

export async function requireAuth(): Promise<string> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user.id;
}

export async function getAuthUserFull() {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    include: { settings: true },
  });

  return user;
}

export async function isAdmin(): Promise<boolean> {
  const user = await getAuthUser();
  return user?.role === "admin";
}
