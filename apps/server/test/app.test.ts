import { describe, expect, it } from "vitest";

import { buildServer } from "../src/app";

function createInMemoryRoomStore() {
  const rooms = new Map<string, Map<"P1" | "P2", string>>();
  let nextRoomIndex = 1;

  return {
    async createRoom(ownerUserId: string) {
      const roomId = `00000000-0000-4000-8000-${String(nextRoomIndex).padStart(12, "0")}`;
      nextRoomIndex += 1;

      rooms.set(roomId, new Map([["P1", ownerUserId]]));

      return {
        roomId,
        ownerUserId,
        seat: "P1" as const
      };
    },
    async joinRoom(roomId: string, userId: string) {
      const seats = rooms.get(roomId);

      if (!seats) {
        return {
          status: "not_found" as const
        };
      }

      for (const [seat, occupant] of seats.entries()) {
        if (occupant === userId) {
          return {
            status: "joined" as const,
            roomId,
            userId,
            seat
          };
        }
      }

      if (seats.size >= 2) {
        return {
          status: "full" as const
        };
      }

      const seat: "P1" | "P2" = seats.has("P1") ? "P2" : "P1";
      seats.set(seat, userId);

      return {
        status: "joined" as const,
        roomId,
        userId,
        seat
      };
    }
  };
}

function buildAuthedSessionLookup(userId: string) {
  return async () => ({
    expires: new Date("2100-01-01T00:00:00.000Z"),
    user: {
      id: userId,
      email: `${userId}@example.com`
    }
  });
}

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
    const roomStore = createInMemoryRoomStore();
    const app = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-1"),
      roomStore
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
      expect(response.json()).toMatchObject({
        ownerUserId: "user-1",
        seat: "P1"
      });
      expect(response.json().roomId).toMatch(/^00000000-0000-4000-8000-\d{12}$/);
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
    const roomStore = createInMemoryRoomStore();
    const ownerApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("owner-1"),
      roomStore
    });

    let createdRoomId = "";

    try {
      const createResponse = await ownerApp.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      createdRoomId = createResponse.json().roomId;
    } finally {
      await ownerApp.close();
    }

    const app = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-2"),
      roomStore
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: `/api/rooms/${createdRoomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        roomId: createdRoomId,
        userId: "user-2",
        seat: "P2"
      });
    } finally {
      await app.close();
    }
  });

  it("returns 404 when joining unknown room", async () => {
    const app = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-1"),
      roomStore: createInMemoryRoomStore()
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/00000000-0000-4000-8000-000000000404/join",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "room_not_found" });
    } finally {
      await app.close();
    }
  });

  it("returns 409 when joining full room", async () => {
    const roomStore = createInMemoryRoomStore();
    const ownerApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("owner-1"),
      roomStore
    });

    let roomId = "";

    try {
      const createResponse = await ownerApp.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      roomId = createResponse.json().roomId;
    } finally {
      await ownerApp.close();
    }

    const secondApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-2"),
      roomStore
    });

    try {
      await secondApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });
    } finally {
      await secondApp.close();
    }

    const thirdApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-3"),
      roomStore
    });

    try {
      const response = await thirdApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "room_full" });
    } finally {
      await thirdApp.close();
    }
  });

  it("returns existing seat when actor rejoins room", async () => {
    const roomStore = createInMemoryRoomStore();
    const ownerApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("owner-1"),
      roomStore
    });

    let roomId = "";

    try {
      const createResponse = await ownerApp.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      roomId = createResponse.json().roomId;
    } finally {
      await ownerApp.close();
    }

    const app = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-2"),
      roomStore
    });

    try {
      const firstJoin = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      const secondJoin = await app.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(firstJoin.statusCode).toBe(200);
      expect(firstJoin.json()).toEqual({
        roomId,
        userId: "user-2",
        seat: "P2"
      });

      expect(secondJoin.statusCode).toBe(200);
      expect(secondJoin.json()).toEqual({
        roomId,
        userId: "user-2",
        seat: "P2"
      });
    } finally {
      await app.close();
    }
  });

  it("returns canonical 404 payload for unknown routes", async () => {
    const app = buildServer();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/.env"
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "not found" });
    } finally {
      await app.close();
    }
  });
});
