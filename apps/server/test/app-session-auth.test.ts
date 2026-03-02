import { describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/app";

describe("server session auth", () => {
  it("returns 401 for /api/me without session cookie", async () => {
    const app = buildServer({
      sessionLookup: async () => null
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/me"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("returns 401 for /api/me when session is unknown", async () => {
    const app = buildServer({
      sessionLookup: async () => null
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=missing"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("returns 401 for /api/me when session is expired", async () => {
    const app = buildServer({
      sessionLookup: async () => ({
        expires: new Date("2000-01-01T00:00:00.000Z"),
        user: {
          id: "user-1",
          email: "user@example.com"
        }
      })
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=expired"
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("returns canonical actor on /api/me with valid session", async () => {
    const app = buildServer({
      sessionLookup: async (token) => {
        if (token !== "valid") {
          return null;
        }

        return {
          expires: new Date("2100-01-01T00:00:00.000Z"),
          user: {
            id: "user-1",
            email: "user@example.com"
          }
        };
      }
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        userId: "user-1",
        email: "user@example.com"
      });
    } finally {
      await app.close();
    }
  });

  it("caches valid session lookups within the TTL", async () => {
    let sessionLookupCalls = 0;
    const app = buildServer({
      sessionLookup: async (token) => {
        sessionLookupCalls += 1;

        if (token !== "valid") {
          return null;
        }

        return {
          expires: new Date("2100-01-01T00:00:00.000Z"),
          user: {
            id: "user-1",
            email: "user@example.com"
          }
        };
      }
    });

    try {
      const firstResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      const secondResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(sessionLookupCalls).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("refreshes cached session lookups after one second", async () => {
    let now = 1_000_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    let sessionLookupCalls = 0;
    const app = buildServer({
      sessionLookup: async (token) => {
        sessionLookupCalls += 1;

        if (token !== "valid") {
          return null;
        }

        return {
          expires: new Date("2100-01-01T00:00:00.000Z"),
          user: {
            id: "user-1",
            email: "user@example.com"
          }
        };
      }
    });

    try {
      const firstResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      now += 1_001;

      const secondResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      expect(sessionLookupCalls).toBe(2);
    } finally {
      dateNowSpy.mockRestore();
      await app.close();
    }
  });

  it("does not reuse cached sessions after backing session expiry", async () => {
    let now = 1_000_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    let sessionLookupCalls = 0;
    const app = buildServer({
      sessionLookup: async (token) => {
        sessionLookupCalls += 1;

        if (token !== "valid") {
          return null;
        }

        if (sessionLookupCalls === 1) {
          return {
            expires: new Date(now + 500),
            user: {
              id: "user-1",
              email: "user@example.com"
            }
          };
        }

        return null;
      }
    });

    try {
      const firstResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      now += 600;

      const secondResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(401);
      expect(sessionLookupCalls).toBe(2);
    } finally {
      dateNowSpy.mockRestore();
      await app.close();
    }
  });

  it("evicts oldest cached sessions when cache reaches max size", async () => {
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    let sessionLookupCalls = 0;
    const app = buildServer({
      sessionLookup: async (token) => {
        sessionLookupCalls += 1;

        return {
          expires: new Date("2100-01-01T00:00:00.000Z"),
          user: {
            id: `user-${token}`,
            email: `${token}@example.com`
          }
        };
      }
    });

    try {
      for (let index = 0; index < 1_000; index += 1) {
        const response = await app.inject({
          method: "GET",
          url: "/api/me",
          headers: {
            cookie: `authjs.session-token=token-${index}`
          }
        });

        expect(response.statusCode).toBe(200);
      }

      const cachedResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=token-0"
        }
      });

      const overflowResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=token-1000"
        }
      });

      const evictedResponse = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: "authjs.session-token=token-0"
        }
      });

      expect(cachedResponse.statusCode).toBe(200);
      expect(overflowResponse.statusCode).toBe(200);
      expect(evictedResponse.statusCode).toBe(200);
      expect(sessionLookupCalls).toBe(1_002);
    } finally {
      dateNowSpy.mockRestore();
      await app.close();
    }
  });

  it("rejects oversized session cookie values before lookup", async () => {
    let sessionLookupCalls = 0;
    const app = buildServer({
      sessionLookup: async () => {
        sessionLookupCalls += 1;

        return {
          expires: new Date("2100-01-01T00:00:00.000Z"),
          user: {
            id: "user-1",
            email: "user@example.com"
          }
        };
      }
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: {
          cookie: `authjs.session-token=${"a".repeat(4097)}`
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
      expect(sessionLookupCalls).toBe(0);
    } finally {
      await app.close();
    }
  });
});
