import { describe, expect, it } from "vitest";

import { buildServer } from "../src/app";

describe("server", () => {
  it("returns health check payload", async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

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

  it("requires auth for room creation", async () => {
    const app = buildServer({
      sessionLookup: async () => null
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("creates room for authenticated actor", async () => {
    const app = buildServer({
      sessionLookup: async () => ({
        expires: new Date("2100-01-01T00:00:00.000Z"),
        user: {
          id: "user-1",
          email: "user@example.com"
        }
      })
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ ownerUserId: "user-1" });
      expect(typeof response.json().roomId).toBe("string");
    } finally {
      await app.close();
    }
  });

  it("requires auth to join room", async () => {
    const app = buildServer({
      sessionLookup: async () => null
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-1/join"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("joins room for authenticated actor", async () => {
    const app = buildServer({
      sessionLookup: async () => ({
        expires: new Date("2100-01-01T00:00:00.000Z"),
        user: {
          id: "user-1",
          email: "user@example.com"
        }
      })
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/room-1/join",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        roomId: "room-1",
        userId: "user-1"
      });
    } finally {
      await app.close();
    }
  });
});
