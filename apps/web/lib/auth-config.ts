import type { Provider } from "next-auth/providers";
import Email from "next-auth/providers/email";
import Google from "next-auth/providers/google";

export const AUTH_VERIFY_PATH = "/auth/verify";

type AuthProviderEnv = {
  authEmailFrom: string;
  authEmailServer: string;
  googleClientId: string;
  googleClientSecret: string;
};

type GoogleProviderEnv = {
  googleClientId: string;
  googleClientSecret: string;
};

type RedirectInput = {
  url: string;
  baseUrl: string;
  allowedExternalCallbackUrl?: string;
};

type DefaultCallbackInput = {
  googleCallback?: string;
};

export function getDefaultCallbackUrl({ googleCallback }: DefaultCallbackInput) {
  if (googleCallback) {
    return googleCallback;
  }

  return AUTH_VERIFY_PATH;
}

export function buildAuthProviders(env: AuthProviderEnv): Provider[] {
  const providers: Provider[] = [
    Email({
      from: env.authEmailFrom,
      server: env.authEmailServer,
      async sendVerificationRequest({ identifier, url }) {
        console.info(`Magic link requested for ${identifier}: ${url}`);
      }
    })
  ];

  if (isGoogleAuthEnabled(env)) {
    providers.push(
      Google({
        clientId: env.googleClientId,
        clientSecret: env.googleClientSecret
      })
    );
  }

  return providers;
}

export function isGoogleAuthEnabled({ googleClientId, googleClientSecret }: GoogleProviderEnv) {
  return googleClientId.trim().length > 0 && googleClientSecret.trim().length > 0;
}

export function resolveAuthRedirect({ url, baseUrl, allowedExternalCallbackUrl }: RedirectInput) {
  if (url.startsWith("/")) {
    return `${baseUrl}${url}`;
  }

  if (url.startsWith(baseUrl)) {
    return url;
  }

  if (allowedExternalCallbackUrl && url === allowedExternalCallbackUrl) {
    return url;
  }

  return `${baseUrl}${AUTH_VERIFY_PATH}`;
}
