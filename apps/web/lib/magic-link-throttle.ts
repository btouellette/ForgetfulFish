import { consumeMagicLinkRateLimit, getIpAddress } from "./magic-link-rate-limit";

type RateLimitStore = Parameters<typeof consumeMagicLinkRateLimit>[0];

type MagicLinkThrottleInput = {
  request: Request;
  pathname: string;
  store: RateLimitStore;
};

export async function getRateLimitRedirectUrl({
  request,
  pathname,
  store
}: MagicLinkThrottleInput): Promise<URL | null> {
  if (!pathname.endsWith("/signin/email")) {
    return null;
  }

  const formData = await request.clone().formData();
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    return null;
  }

  const ipAddress = getIpAddress(request.headers);
  const result = await consumeMagicLinkRateLimit(store, {
    email,
    ipAddress
  });
  if (result.allowed) {
    return null;
  }

  const callbackUrl = formData.get("callbackUrl");
  const verifyRequestUrl = new URL("/api/auth/verify-request", request.url);
  verifyRequestUrl.searchParams.set("provider", "email");
  verifyRequestUrl.searchParams.set("type", "email");
  if (typeof callbackUrl === "string" && callbackUrl.trim().length > 0) {
    verifyRequestUrl.searchParams.set("callbackUrl", callbackUrl);
  }

  console.warn("Magic-link request rate-limited", {
    ipAddress,
    email: "redacted",
    resetAt: result.resetAt.toISOString()
  });

  return verifyRequestUrl;
}
