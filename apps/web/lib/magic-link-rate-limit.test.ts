import { describe, expect, it } from "vitest";

import {
  consumeMagicLinkRateLimit,
  getIpAddress,
  normalizeEmail,
  resetRateLimitCleanupStateForTests
} from "./magic-link-rate-limit";

type LimitRow = {
  key: string;
  windowStart: Date;
  count: number;
};

function createInMemoryStore() {
  const rows = new Map<string, LimitRow>();
  let cleanupCount = 0;

  return {
    async $queryRaw(
      _query: TemplateStringsArray,
      ...values: Array<string | Date | number>
    ): Promise<Array<{ count: number }>> {
      const keyValue = values[0];
      const windowStartValue = values[1];
      if (typeof keyValue !== "string" || !(windowStartValue instanceof Date)) {
        throw new Error("unexpected query inputs");
      }

      const mapKey = `${keyValue}|${windowStartValue.getTime()}`;
      const existing = rows.get(mapKey);
      if (!existing) {
        rows.set(mapKey, {
          key: keyValue,
          windowStart: windowStartValue,
          count: 1
        });
      } else {
        existing.count += 1;
      }

      const current = rows.get(mapKey);
      if (!current) {
        throw new Error("expected rate-limit row to exist");
      }

      return [{ count: current.count }];
    },
    async $executeRaw(
      _query: TemplateStringsArray,
      ..._values: Array<string | Date | number>
    ): Promise<number> {
      cleanupCount += 1;
      return 0;
    },
    getCleanupCount() {
      return cleanupCount;
    }
  };
}

describe("magic-link rate limit", () => {
  it("normalizes emails to lower case + trimmed", () => {
    expect(normalizeEmail("  Player@Example.com ")).toBe("player@example.com");
  });

  it("extracts client ip from forwarded headers", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.10, 10.0.0.2" });
    expect(getIpAddress(headers)).toBe("203.0.113.10");
  });

  it("enforces max attempts within a window per ip + email", async () => {
    const store = createInMemoryStore();
    resetRateLimitCleanupStateForTests();
    const now = new Date("2026-02-26T20:00:00.000Z");

    for (let i = 0; i < 5; i += 1) {
      const result = await consumeMagicLinkRateLimit(store, {
        email: "player@example.com",
        ipAddress: "203.0.113.10",
        now
      });
      expect(result.allowed).toBe(true);
    }

    const blocked = await consumeMagicLinkRateLimit(store, {
      email: "player@example.com",
      ipAddress: "203.0.113.10",
      now
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets attempts on new time window", async () => {
    const store = createInMemoryStore();
    resetRateLimitCleanupStateForTests();
    const now = new Date("2026-02-26T20:00:00.000Z");

    for (let i = 0; i < 6; i += 1) {
      await consumeMagicLinkRateLimit(store, {
        email: "player@example.com",
        ipAddress: "203.0.113.10",
        now
      });
    }

    const freshWindow = await consumeMagicLinkRateLimit(store, {
      email: "player@example.com",
      ipAddress: "203.0.113.10",
      now: new Date("2026-02-26T20:11:00.000Z")
    });

    expect(freshWindow.allowed).toBe(true);
  });

  it("runs cleanup at most once per cleanup interval", async () => {
    const store = createInMemoryStore();
    resetRateLimitCleanupStateForTests();

    await consumeMagicLinkRateLimit(store, {
      email: "player@example.com",
      ipAddress: "203.0.113.10",
      now: new Date("2026-02-26T20:00:00.000Z")
    });
    await consumeMagicLinkRateLimit(store, {
      email: "player@example.com",
      ipAddress: "203.0.113.10",
      now: new Date("2026-02-26T20:02:00.000Z")
    });
    await consumeMagicLinkRateLimit(store, {
      email: "player@example.com",
      ipAddress: "203.0.113.10",
      now: new Date("2026-02-26T20:06:00.000Z")
    });

    expect(store.getCleanupCount()).toBe(2);
  });
});
