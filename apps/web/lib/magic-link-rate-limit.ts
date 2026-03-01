type RateLimitInput = {
  email: string;
  ipAddress: string;
  now?: Date;
  maxAttempts?: number;
  windowMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
};

type RateLimitStore = {
  $queryRaw(
    query: TemplateStringsArray,
    ...values: Array<string | Date | number>
  ): Promise<Array<{ count: number }>>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: Array<string | Date | number>
  ): Promise<number>;
};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanupAt = 0;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getIpAddress(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown-ip";
}

export async function consumeMagicLinkRateLimit(
  store: RateLimitStore,
  {
    email,
    ipAddress,
    now = new Date(),
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    windowMs = DEFAULT_WINDOW_MS
  }: RateLimitInput
): Promise<RateLimitResult> {
  const normalizedEmail = normalizeEmail(email);
  const key = `${ipAddress}|${normalizedEmail}`;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const resetAt = new Date(windowStart.getTime() + windowMs);

  const rows = await store.$queryRaw`
    INSERT INTO auth_rate_limits (key, window_start, count, updated_at)
    VALUES (${key}, ${windowStart}, 1, ${now})
    ON CONFLICT (key, window_start)
    DO UPDATE SET
      count = auth_rate_limits.count + 1,
      updated_at = ${now}
    RETURNING count
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("failed to persist auth rate limit row");
  }

  const remaining = Math.max(0, maxAttempts - row.count);
  await maybeCleanupRateLimitRows(store, now, DEFAULT_RETENTION_MS);

  return {
    allowed: row.count <= maxAttempts,
    remaining,
    resetAt
  };
}

async function maybeCleanupRateLimitRows(store: RateLimitStore, now: Date, retentionMs: number) {
  if (now.getTime() - lastCleanupAt < CLEANUP_MIN_INTERVAL_MS) {
    return;
  }

  lastCleanupAt = now.getTime();
  const cutoff = new Date(now.getTime() - retentionMs);

  await store.$executeRaw`
    DELETE FROM auth_rate_limits
    WHERE window_start < ${cutoff}
  `;
}

export function resetRateLimitCleanupStateForTests() {
  lastCleanupAt = 0;
}
