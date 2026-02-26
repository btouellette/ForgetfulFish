import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { buildAuthProviders, resolveAuthRedirect } from "./lib/auth-config";

const authEmailFrom = process.env.AUTH_EMAIL_FROM ?? "Forgetful Fish <noreply@forgetfulfish.com>";
const authEmailServer = process.env.AUTH_EMAIL_SERVER ?? "smtp://localhost:1025";
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const googleCallback = process.env.GOOGLE_CALLBACK ?? "";

let handlersPromise: Promise<ReturnType<typeof NextAuth>["handlers"]> | undefined;

export function getAuthHandlers() {
  if (!handlersPromise) {
    handlersPromise = (async () => {
      const { prisma } = await import("@forgetful-fish/database");

      return NextAuth({
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
      }).handlers;
    })();
  }

  return handlersPromise;
}
