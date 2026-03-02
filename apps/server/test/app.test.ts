import { describe, expect, it, vi } from "vitest";

import { createInitialGameState } from "@forgetful-fish/game-engine";

import { buildServer } from "../src/app";

function createInMemoryRoomStore() {
  type RoomState = {
    participants: Map<"P1" | "P2", { userId: string; ready: boolean }>;
    gameId: string | null;
    gameState: unknown | null;
    stateVersion: number | null;
    lastAppliedEventSeq: number | null;
    gameEvents: Array<{
      seq: number;
      eventType: string;
      schemaVersion: number;
      causedByUserId: string;
      payload: unknown;
    }>;
  };

  const rooms = new Map<string, RoomState>();
  let nextRoomIndex = 1;
  let nextGameIndex = 1;

  return {
    async createRoom(ownerUserId: string) {
      const roomId = `00000000-0000-4000-8000-${String(nextRoomIndex).padStart(12, "0")}`;
      nextRoomIndex += 1;

      rooms.set(roomId, {
        participants: new Map([["P1", { userId: ownerUserId, ready: false }]]),
        gameId: null,
        gameState: null,
        stateVersion: null,
        lastAppliedEventSeq: null,
        gameEvents: []
      });

      return {
        roomId,
        ownerUserId,
        seat: "P1" as const
      };
    },
    async joinRoom(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return {
          status: "not_found" as const
        };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId === userId) {
          return {
            status: "joined" as const,
            roomId,
            userId,
            seat
          };
        }
      }

      if (room.participants.size >= 2) {
        return {
          status: "full" as const
        };
      }

      const seat: "P1" | "P2" = room.participants.has("P1") ? "P2" : "P1";
      room.participants.set(seat, { userId, ready: false });

      return {
        status: "joined" as const,
        roomId,
        userId,
        seat
      };
    },
    async getLobby(roomId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return {
          status: "not_found" as const
        };
      }

      const participants = [...room.participants.entries()].map(([seat, participant]) => ({
        seat,
        userId: participant.userId,
        ready: participant.ready
      }));

      return {
        status: "ok" as const,
        payload: {
          roomId,
          participants,
          gameId: room.gameId,
          gameStatus: room.gameId ? ("started" as const) : ("not_started" as const)
        }
      };
    },
    async setReady(roomId: string, userId: string, ready: boolean) {
      const room = rooms.get(roomId);

      if (!room) {
        return {
          status: "not_found" as const
        };
      }

      if (room.gameId) {
        for (const [seat, participant] of room.participants.entries()) {
          if (participant.userId !== userId) {
            continue;
          }

          return {
            status: "ok" as const,
            roomId,
            userId,
            seat,
            ready: participant.ready
          };
        }

        return {
          status: "forbidden" as const
        };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId !== userId) {
          continue;
        }

        room.participants.set(seat, {
          ...participant,
          ready
        });

        return {
          status: "ok" as const,
          roomId,
          userId,
          seat,
          ready
        };
      }

      return {
        status: "forbidden" as const
      };
    },
    async startGame(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return {
          status: "not_found" as const
        };
      }

      const participants = [...room.participants.values()];
      const isParticipant = participants.some((participant) => participant.userId === userId);

      if (!isParticipant) {
        return {
          status: "forbidden" as const
        };
      }

      if (room.gameId) {
        return {
          status: "started" as const,
          roomId,
          gameId: room.gameId,
          gameStatus: "started" as const
        };
      }

      if (participants.length < 2 || participants.some((participant) => !participant.ready)) {
        return {
          status: "not_ready" as const
        };
      }

      const gameId = `10000000-0000-4000-8000-${String(nextGameIndex).padStart(12, "0")}`;
      nextGameIndex += 1;
      room.gameId = gameId;
      const participantEntries = [...room.participants.entries()].sort(([left], [right]) => {
        if (left === right) {
          return 0;
        }

        return left === "P1" ? -1 : 1;
      });
      const firstParticipant = participantEntries[0];
      const secondParticipant = participantEntries[1];

      if (!firstParticipant || !secondParticipant) {
        return {
          status: "not_ready" as const
        };
      }

      const stateVersion = 1;
      const gameState = createInitialGameState(
        firstParticipant[1].userId,
        secondParticipant[1].userId
      );
      room.gameState = gameState;
      room.stateVersion = stateVersion;
      room.lastAppliedEventSeq = 0;
      room.gameEvents = [
        {
          seq: 0,
          eventType: "game_initialized",
          schemaVersion: stateVersion,
          causedByUserId: userId,
          payload: {
            stateVersion,
            state: gameState,
            playersBySeat: participantEntries.map(([seat, participant]) => ({
              seat,
              userId: participant.userId
            }))
          }
        }
      ];

      return {
        status: "started" as const,
        roomId,
        gameId,
        gameStatus: "started" as const
      };
    },
    inspectRoom(roomId: string) {
      return rooms.get(roomId);
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

type InMemoryRoomStore = ReturnType<typeof createInMemoryRoomStore>;

async function injectAs(
  roomStore: InMemoryRoomStore,
  userId: string,
  request: {
    method: "GET" | "POST";
    url: string;
    payload?: unknown;
  }
): Promise<any> {
  const app = buildServer({
    sessionLookup: buildAuthedSessionLookup(userId),
    roomStore
  });

  try {
    return await app.inject({
      method: request.method,
      url: request.url,
      headers: {
        cookie: "authjs.session-token=valid"
      },
      payload: request.payload as any
    });
  } finally {
    await app.close();
  }
}

async function createRoomAs(roomStore: InMemoryRoomStore, userId: string) {
  const response = await injectAs(roomStore, userId, {
    method: "POST",
    url: "/api/rooms"
  });

  return response.json().roomId as string;
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

  it("rejects POST routes without authorizeRequest preHandler", async () => {
    const app = buildServer();

    try {
      expect(() => {
        app.post("/api/public", async () => ({ ok: true }));
      }).toThrow('POST route "/api/public" must use authorizeRequest preHandler');
    } finally {
      await app.close();
    }
  });

  it("rejects other mutating routes without authorizeRequest preHandler", async () => {
    const app = buildServer();

    try {
      expect(() => {
        app.put("/api/public-put", async () => ({ ok: true }));
      }).toThrow('PUT route "/api/public-put" must use authorizeRequest preHandler');

      expect(() => {
        app.patch("/api/public-patch", async () => ({ ok: true }));
      }).toThrow('PATCH route "/api/public-patch" must use authorizeRequest preHandler');

      expect(() => {
        app.delete("/api/public-delete", async () => ({ ok: true }));
      }).toThrow('DELETE route "/api/public-delete" must use authorizeRequest preHandler');
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

  it("returns room lobby for participant", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    const response = await injectAs(roomStore, "owner-1", {
      method: "GET",
      url: `/api/rooms/${roomId}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roomId,
      participants: [{ userId: "owner-1", seat: "P1", ready: false }],
      gameId: null,
      gameStatus: "not_started"
    });
  });

  it("updates readiness for room participant", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    const readyResponse = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      payload: {
        ready: true
      }
    });

    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json()).toEqual({
      roomId,
      userId: "owner-1",
      seat: "P1",
      ready: true
    });
  });

  it("returns 403 when non participant tries readiness update", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    const response = await injectAs(roomStore, "user-9", {
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      payload: {
        ready: true
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("requires both players ready before explicit game start", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    const response = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/start`
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "room_not_ready" });
  });

  it("starts game when both players are ready and is idempotent", async () => {
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

    const playerTwoApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-2"),
      roomStore
    });

    try {
      await playerTwoApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      await playerTwoApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: {
          cookie: "authjs.session-token=valid"
        },
        payload: {
          ready: true
        }
      });
    } finally {
      await playerTwoApp.close();
    }

    const ownerReadyApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("owner-1"),
      roomStore
    });

    try {
      await ownerReadyApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: {
          cookie: "authjs.session-token=valid"
        },
        payload: {
          ready: true
        }
      });

      const firstStart = await ownerReadyApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      const secondStart = await ownerReadyApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(firstStart.statusCode).toBe(200);
      expect(firstStart.json()).toEqual({
        roomId,
        gameId: expect.stringMatching(/^10000000-0000-4000-8000-\d{12}$/),
        gameStatus: "started"
      });

      expect(secondStart.statusCode).toBe(200);
      expect(secondStart.json()).toEqual(firstStart.json());

      const readyAfterStart = await ownerReadyApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: {
          cookie: "authjs.session-token=valid"
        },
        payload: {
          ready: false
        }
      });

      expect(readyAfterStart.statusCode).toBe(200);
      expect(readyAfterStart.json()).toEqual({
        roomId,
        userId: "owner-1",
        seat: "P1",
        ready: true
      });
    } finally {
      await ownerReadyApp.close();
    }
  });

  it("persists versioned initial snapshot and exactly one init event on start", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    await injectAs(roomStore, "user-2", {
      method: "POST",
      url: `/api/rooms/${roomId}/join`
    });

    await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      payload: {
        ready: true
      }
    });

    await injectAs(roomStore, "user-2", {
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      payload: {
        ready: true
      }
    });

    const startResponse = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/start`
    });

    const retryStartResponse = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/start`
    });

    expect(startResponse.statusCode).toBe(200);
    expect(retryStartResponse.statusCode).toBe(200);
    expect(retryStartResponse.json()).toEqual(startResponse.json());

    const room = roomStore.inspectRoom(roomId);
    expect(room).toBeDefined();
    expect(room?.stateVersion).toBe(1);
    expect(room?.lastAppliedEventSeq).toBe(0);
    expect(room?.gameState).toEqual(createInitialGameState("owner-1", "user-2"));
    expect(room?.gameEvents).toHaveLength(1);
    expect(room?.gameEvents[0]).toEqual({
      seq: 0,
      eventType: "game_initialized",
      schemaVersion: 1,
      causedByUserId: "owner-1",
      payload: {
        stateVersion: 1,
        state: createInitialGameState("owner-1", "user-2"),
        playersBySeat: [
          {
            seat: "P1",
            userId: "owner-1"
          },
          {
            seat: "P2",
            userId: "user-2"
          }
        ]
      }
    });
  });

  it("completes end-to-end lobby flow through game start", async () => {
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

    const playerTwoApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("user-2"),
      roomStore
    });

    try {
      await playerTwoApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/join`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      await playerTwoApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: {
          cookie: "authjs.session-token=valid"
        },
        payload: {
          ready: true
        }
      });
    } finally {
      await playerTwoApp.close();
    }

    const ownerReadyApp = buildServer({
      sessionLookup: buildAuthedSessionLookup("owner-1"),
      roomStore
    });

    try {
      await ownerReadyApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/ready`,
        headers: {
          cookie: "authjs.session-token=valid"
        },
        payload: {
          ready: true
        }
      });

      const startResponse = await ownerReadyApp.inject({
        method: "POST",
        url: `/api/rooms/${roomId}/start`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      const lobbyResponse = await ownerReadyApp.inject({
        method: "GET",
        url: `/api/rooms/${roomId}`,
        headers: {
          cookie: "authjs.session-token=valid"
        }
      });

      expect(startResponse.statusCode).toBe(200);
      expect(lobbyResponse.statusCode).toBe(200);
      expect(lobbyResponse.json()).toEqual({
        roomId,
        participants: [
          { userId: "owner-1", seat: "P1", ready: true },
          { userId: "user-2", seat: "P2", ready: true }
        ],
        gameId: startResponse.json().gameId,
        gameStatus: "started"
      });
    } finally {
      await ownerReadyApp.close();
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
