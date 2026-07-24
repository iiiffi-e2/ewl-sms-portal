import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

// Required on HTTPS when /embed/* is iframe-embedded on another origin (third-party cookie context).
const useCrossOriginEmbedCookies = process.env.NEXTAUTH_EMBED_CROSS_ORIGIN === "true";
const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;

function buildCrossOriginEmbedCookies(): NonNullable<NextAuthOptions["cookies"]> {
  const secure = useSecureCookies || useCrossOriginEmbedCookies;
  const sameSite = "none" as const;

  return {
    sessionToken: {
      name: secure ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite,
        path: "/",
        secure,
      },
    },
    callbackUrl: {
      name: secure ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        sameSite,
        path: "/",
        secure,
      },
    },
    csrfToken: {
      name: secure ? "__Secure-next-auth.csrf-token" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite,
        path: "/",
        secure,
      },
    },
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  useSecureCookies: useSecureCookies || useCrossOriginEmbedCookies,
  cookies: useCrossOriginEmbedCookies ? buildCrossOriginEmbedCookies() : undefined,
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user) {
          return null;
        }

        // Disabled accounts cannot sign in at all, even with valid credentials.
        if (user.disabledAt) {
          return null;
        }

        const validPassword = await compare(credentials.password, user.passwordHash);
        if (!validPassword) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "nurse";
      }

      return session;
    },
  },
};

export function getAuthSession() {
  return getServerSession(authOptions);
}
