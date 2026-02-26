import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import Google from "next-auth/providers/google";

import { isGoogleAuthEnabled, resolveAuthRedirect } from "./lib/auth-config";
import { sendMagicLinkEmail } from "./lib/magic-link-email";

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
        providers: [
          Nodemailer({
            id: "email",
            from: authEmailFrom,
            server: authEmailServer,
            async sendVerificationRequest({ identifier, url }) {
              await sendMagicLinkEmail({
                authEmailFrom,
                authEmailServer,
                identifier,
                url
              });
            }
          }),
          ...(isGoogleAuthEnabled({ googleClientId, googleClientSecret })
            ? [
                Google({
                  clientId: googleClientId,
                  clientSecret: googleClientSecret
                })
              ]
            : [])
        ],
        trustHost: true,
        debug: process.env.NODE_ENV !== "production",
        logger: {
          error(error) {
            console.error("Auth.js error", { error });
          },
          warn(message) {
            console.warn("Auth.js warning", { message });
          },
          debug(message) {
            console.info("Auth.js debug", { message });
          }
        },
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
