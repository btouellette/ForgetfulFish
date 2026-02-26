import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { prisma } from "@forgetful-fish/database";

import { buildAuthProviders, resolveAuthRedirect } from "./lib/auth-config";

const authEmailFrom = process.env.AUTH_EMAIL_FROM ?? "Forgetful Fish <noreply@forgetful.fish>";
const authEmailServer = process.env.AUTH_EMAIL_SERVER ?? "smtp://localhost:1025";
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const googleCallback = process.env.GOOGLE_CALLBACK ?? "";

const authResult = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: buildAuthProviders({
    authEmailFrom,
    authEmailServer,
    googleClientId,
    googleClientSecret
  }),
  trustHost: true,
  pages: {
    signIn: "/"
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      return resolveAuthRedirect({
        url,
        baseUrl,
        allowedExternalCallbackUrl: googleCallback
      });
    }
  }
});

export const handlers = authResult.handlers;
