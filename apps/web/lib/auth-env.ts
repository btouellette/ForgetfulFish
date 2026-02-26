type AuthEnvironment = {
  authEmailFrom: string;
  authEmailServer: string;
  authSecret: string;
  authUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleCallback: string;
};

function readTrimmed(name: string) {
  return (process.env[name] ?? "").trim();
}

function requireValue(name: string) {
  const value = readTrimmed(name);
  if (!value) {
    throw new Error(`Missing required auth environment variable: ${name}`);
  }

  return value;
}

function requireUrl(name: string) {
  const value = requireValue(name);
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid URL in auth environment variable: ${name}`);
  }

  return value;
}

export function getAuthEnvironment(): AuthEnvironment {
  const authSecret = requireValue("AUTH_SECRET");
  const authUrl = requireUrl("AUTH_URL");
  const authEmailFrom = requireValue("AUTH_EMAIL_FROM");
  const authEmailServer = requireUrl("AUTH_EMAIL_SERVER");
  const googleClientId = readTrimmed("GOOGLE_CLIENT_ID");
  const googleClientSecret = readTrimmed("GOOGLE_CLIENT_SECRET");
  const googleCallback = readTrimmed("GOOGLE_CALLBACK");

  const hasGoogleClientId = googleClientId.length > 0;
  const hasGoogleClientSecret = googleClientSecret.length > 0;
  if (hasGoogleClientId !== hasGoogleClientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set or both be empty");
  }

  if (googleCallback) {
    try {
      new URL(googleCallback);
    } catch {
      throw new Error("Invalid URL in auth environment variable: GOOGLE_CALLBACK");
    }
  }

  return {
    authEmailFrom,
    authEmailServer,
    authSecret,
    authUrl,
    googleClientId,
    googleClientSecret,
    googleCallback
  };
}
