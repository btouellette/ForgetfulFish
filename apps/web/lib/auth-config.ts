export const AUTH_VERIFY_PATH = "/auth/verify";

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
