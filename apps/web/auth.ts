import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import Google from "next-auth/providers/google";

import { getAuthEnvironment } from "./lib/auth-env";
import { isGoogleAuthEnabled, resolveAuthRedirect } from "./lib/auth-config";
import { sendMagicLinkEmail } from "./lib/magic-link-email";

const authEnv = getAuthEnvironment();

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: "UnknownError",
    message: "unknown error"
  };
}

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
            from: authEnv.authEmailFrom,
            server: authEnv.authEmailServer,
            async sendVerificationRequest({ identifier, url }) {
              await sendMagicLinkEmail({
                authEmailFrom: authEnv.authEmailFrom,
                authEmailServer: authEnv.authEmailServer,
                identifier,
                url
              });
            }
          }),
          ...(isGoogleAuthEnabled({
            googleClientId: authEnv.googleClientId,
            googleClientSecret: authEnv.googleClientSecret
          })
            ? [
                Google({
                  clientId: authEnv.googleClientId,
                  clientSecret: authEnv.googleClientSecret
                })
              ]
            : [])
        ],
        trustHost: true,
        secret: authEnv.authSecret,
        debug: process.env.NODE_ENV !== "production",
        logger: {
          error(error) {
            console.error("Auth.js error", sanitizeError(error));
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
              allowedExternalCallbackUrl: authEnv.googleCallback
            });
          }
        }
      }).handlers;
    })();
  }

  return handlersPromise;
}
