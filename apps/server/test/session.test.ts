import { describe, expect, it, vi } from "vitest";

import { createCachedSessionLookup, getSessionToken } from "../src/session";

describe("session helpers", () => {
  it("extracts known session token keys from cookie header", () => {
    const token = getSessionToken("foo=bar; __Secure-authjs.session-token=abc123; baz=qux");

    expect(token).toBe("abc123");
  });

  it("returns undefined for oversized session cookies", () => {
    const token = getSessionToken(`authjs.session-token=${"a".repeat(4097)}`);

    expect(token).toBeUndefined();
  });

  it("caches valid lookups and refreshes after TTL", async () => {
    let now = 1_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    let lookupCalls = 0;
    const lookup = createCachedSessionLookup(async (sessionToken) => {
      lookupCalls += 1;
      return {
        expires: new Date("2100-01-01T00:00:00.000Z"),
        user: {
          id: `user-${sessionToken}`,
          email: `${sessionToken}@example.com`
        }
      };
    });

    try {
      await lookup("token-1");
      await lookup("token-1");
      expect(lookupCalls).toBe(1);

      now += 1_001;
      await lookup("token-1");
      expect(lookupCalls).toBe(2);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("does not cache already expired sessions", async () => {
    let lookupCalls = 0;
    const lookup = createCachedSessionLookup(async () => {
      lookupCalls += 1;
      return {
        expires: new Date("2000-01-01T00:00:00.000Z"),
        user: {
          id: "user-1",
          email: "user-1@example.com"
        }
      };
    });

    const first = await lookup("token-1");
    const second = await lookup("token-1");

    expect(first).toEqual(second);
    expect(lookupCalls).toBe(2);
  });
});
