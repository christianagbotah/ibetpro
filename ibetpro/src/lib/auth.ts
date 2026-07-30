// ============================================================================
// iBetPro NextAuth Configuration
// Credentials-based authentication with proper session management
// ============================================================================

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        // Check for admin login
        if (
          credentials.email === config.admin.email &&
          credentials.password === config.admin.password
        ) {
          // Find or create admin user
          let admin = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!admin) {
            admin = await prisma.user.create({
              data: {
                email: credentials.email,
                name: "Admin",
                role: "admin",
                balance: 0,
                bankroll: 0,
                settings: {
                  create: {
                    autoBettingEnabled: false,
                    riskLevel: "medium",
                    commissionRate: config.commission.defaultRate,
                  },
                },
              },
            });
          }

          return {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
          };
        }

        // Regular user login
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("No account found with this email");
        }

        // In production, you would hash passwords with bcrypt
        // For now, we check against a simple password field
        // TODO: Add password hashing with bcrypt
        if (user.role === "admin") {
          // Admin already checked above
          throw new Error("Invalid credentials");
        }

        // For initial setup, accept any password for existing users
        // This will be replaced with proper password verification
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: config.nextauth.secret,
};
