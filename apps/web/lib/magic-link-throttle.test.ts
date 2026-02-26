import { describe, expect, it } from "vitest";

import { getRateLimitRedirectUrl } from "./magic-link-throttle";

function createStoreWithCount(count: number) {
  return {
    async $queryRaw() {
      return [{ count }];
    },
    async $executeRaw() {
      return 0;
    }
  };
}

describe("magic-link throttle", () => {
  it("returns verify-request redirect when email signin is throttled", async () => {
    const body = new URLSearchParams({
      email: "player@example.com",
      callbackUrl: "https://forgetfulfish.com/auth/verify"
    });
    const request = new Request("https://forgetfulfish.com/api/auth/signin/email", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "203.0.113.10"
      },
      body
    });

    const redirectUrl = await getRateLimitRedirectUrl({
      request,
      pathname: "/api/auth/signin/email",
      store: createStoreWithCount(6)
    });

    expect(redirectUrl?.pathname).toBe("/api/auth/verify-request");
    expect(redirectUrl?.searchParams.get("provider")).toBe("email");
    expect(redirectUrl?.searchParams.get("type")).toBe("email");
  });

  it("does not redirect when request is still allowed", async () => {
    const body = new URLSearchParams({ email: "player@example.com" });
    const request = new Request("https://forgetfulfish.com/api/auth/signin/email", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "203.0.113.10"
      },
      body
    });

    const redirectUrl = await getRateLimitRedirectUrl({
      request,
      pathname: "/api/auth/signin/email",
      store: createStoreWithCount(2)
    });

    expect(redirectUrl).toBeNull();
  });
});
