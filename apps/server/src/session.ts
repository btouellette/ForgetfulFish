import { prisma } from "@forgetful-fish/database";

export type Actor = {
  userId: string;
  email: string;
};

export type SessionLookupResult = {
  expires: Date;
  user: {
    id: string;
    email: string;
  };
};

export type SessionLookup = (sessionToken: string) => Promise<SessionLookupResult | null>;

const MAX_SESSION_COOKIE_LENGTH = 4096;
const SESSION_CACHE_TTL_MS = 1_000;
const SESSION_CACHE_MAX_SIZE = 1_000;

type CachedSessionLookupResult = {
  result: SessionLookupResult;
  cachedAt: number;
};

function isCachedSessionTtlExpired(cached: CachedSessionLookupResult, now: number) {
  return now - cached.cachedAt >= SESSION_CACHE_TTL_MS;
}

function isSessionCookieKey(name: string) {
  return (
    name === "__Secure-authjs.session-token" ||
    name === "authjs.session-token" ||
    name === "__Secure-next-auth.session-token" ||
    name === "next-auth.session-token"
  );
}

export function getSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return undefined;
  }

  const cookieEntries = cookieHeader.split(";");

  for (const entry of cookieEntries) {
    const [rawName, ...rawValueParts] = entry.split("=");

    if (!rawName || rawValueParts.length === 0) {
      continue;
    }

    const name = rawName.trim();

    if (!isSessionCookieKey(name)) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();

    if (!rawValue || rawValue.length > MAX_SESSION_COOKIE_LENGTH) {
      continue;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export async function lookupSessionInDatabase(
  sessionToken: string
): Promise<SessionLookupResult | null> {
  const session = await prisma.session.findUnique({
    where: {
      sessionToken
    },
    select: {
      expires: true,
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  return {
    expires: session.expires,
    user: {
      id: session.user.id,
      email: session.user.email
    }
  };
}

function pruneSessionCache(sessionCache: Map<string, CachedSessionLookupResult>, now: number) {
  while (true) {
    const oldestEntry = sessionCache.entries().next();

    if (oldestEntry.done) {
      return;
    }

    const [sessionToken, cached] = oldestEntry.value;

    if (!isCachedSessionTtlExpired(cached, now)) {
      return;
    }

    sessionCache.delete(sessionToken);
  }
}

function trimSessionCacheToMaxSize(sessionCache: Map<string, CachedSessionLookupResult>) {
  while (sessionCache.size > SESSION_CACHE_MAX_SIZE) {
    const oldestSessionToken = sessionCache.keys().next().value;

    if (oldestSessionToken === undefined) {
      return;
    }

    sessionCache.delete(oldestSessionToken);
  }
}

export function createCachedSessionLookup(sessionLookup: SessionLookup): SessionLookup {
  const sessionCache = new Map<string, CachedSessionLookupResult>();

  return async (sessionToken: string) => {
    const now = Date.now();
    pruneSessionCache(sessionCache, now);

    const cached = sessionCache.get(sessionToken);

    if (cached) {
      if (cached.result.expires.getTime() > now) {
        return cached.result;
      }

      sessionCache.delete(sessionToken);
    }

    const result = await sessionLookup(sessionToken);

    if (result && result.expires.getTime() > now) {
      sessionCache.set(sessionToken, {
        result,
        cachedAt: now
      });
      trimSessionCacheToMaxSize(sessionCache);
    }

    return result;
  };
}
