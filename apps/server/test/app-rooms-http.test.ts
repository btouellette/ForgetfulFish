import { describe, expect, it } from "vitest";

import { playerGameViewSchema } from "@forgetful-fish/realtime-contract";

import { createInitialGameStateFromDecks } from "@forgetful-fish/game-engine";

import { buildServer } from "../src/app";
import {
  buildAuthedSessionLookup,
  createInMemoryRoomStore,
  createRoomAs,
  injectAs
} from "./helpers/app-test-helpers";
import { createGameplayDeckPreset } from "../src/room-store/deck-preset";

describe("server room routes", () => {
  async function startGameForTwoPlayers(roomStore: ReturnType<typeof createInMemoryRoomStore>) {
    const roomId = await createRoomAs(roomStore, "owner-1");

    await injectAs(roomStore, "player-2", {
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

    await injectAs(roomStore, "player-2", {
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

    expect(startResponse.statusCode).toBe(200);

    return {
      roomId,
      gameId: startResponse.json().gameId as string
    };
  }

  function yesNoPendingChoice(forPlayer: "owner-1" | "player-2") {
    return {
      id: `choice-${forPlayer}-yes-no`,
      type: "CHOOSE_YES_NO" as const,
      forPlayer,
      prompt: "Choose yes or no",
      constraints: { prompt: "Choose yes or no" }
    };
  }

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

    const startedGameId: string = startResponse.json().gameId;
    const expectedInitialState = createInitialGameStateFromDecks("owner-1", "user-2", {
      id: startedGameId,
      rngSeed: `seed-${startedGameId}`,
      decks: {
        playerOne: createGameplayDeckPreset(),
        playerTwo: createGameplayDeckPreset()
      },
      openingDrawCount: 0
    });

    const room = roomStore.inspectRoom(roomId);
    expect(room).toBeDefined();
    expect(room?.stateVersion).toBe(1);
    expect(room?.lastAppliedEventSeq).toBe(0);
    expect(room?.gameState).toEqual(expectedInitialState);
    expect(room?.gameEvents).toHaveLength(1);
    expect(room?.gameEvents[0]).toEqual({
      seq: 0,
      eventType: "game_initialized",
      schemaVersion: 1,
      causedByUserId: "owner-1",
      payload: {
        stateVersion: 1,
        state: expectedInitialState,
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

  it("requires auth for gameplay command application", async () => {
    const app = buildServer({
      sessionLookup: async () => null
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/rooms/00000000-0000-4000-8000-000000000001/commands",
        payload: {
          command: {
            type: "PASS_PRIORITY"
          }
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("requires auth for projected game-state fetch", async () => {
    const app = buildServer({
      sessionLookup: async () => null
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/rooms/00000000-0000-4000-8000-000000000001/game"
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: "unauthorized" });
    } finally {
      await app.close();
    }
  });

  it("returns 404 when fetching projected game state before a room has started", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    const response = await injectAs(roomStore, "owner-1", {
      method: "GET",
      url: `/api/rooms/${roomId}/game`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "game_not_found" });
  });

  it("returns 403 when non-participant fetches projected game state", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId } = await startGameForTwoPlayers(roomStore);

    const response = await injectAs(roomStore, "outsider-9", {
      method: "GET",
      url: `/api/rooms/${roomId}/game`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("returns a participant-scoped projected game view without leaking hidden state", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId, gameId } = await startGameForTwoPlayers(roomStore);

    const response = await injectAs(roomStore, "owner-1", {
      method: "GET",
      url: `/api/rooms/${roomId}/game`
    });

    expect(response.statusCode).toBe(200);

    const parsed = playerGameViewSchema.parse(response.json());
    const hiddenLibrary = parsed.zones.find(
      (zone) => zone.zoneRef.kind === "library" && zone.objectIds === undefined
    );

    expect(parsed.viewerPlayerId).toBe("owner-1");
    expect(parsed.stateVersion).toBe(1);
    expect(parsed.viewer.id).toBe("owner-1");
    expect(parsed.opponent.id).toBe("player-2");
    expect(parsed.viewer.hand).toEqual([]);
    expect(parsed.opponent.handCount).toBeGreaterThanOrEqual(0);
    expect(parsed.pendingChoice).toBeNull();
    expect(parsed.stack).toEqual([]);
    expect(parsed.zones.length).toBeGreaterThan(0);
    expect(hiddenLibrary).toMatchObject({ count: expect.any(Number) });
    expect(response.body).not.toContain("rngSeed");
    expect(response.body).not.toContain("engineVersion");
    expect(response.body).not.toContain("lkiStore");
    expect(response.body).not.toContain("triggerQueue");
    expect(response.body).not.toContain(gameId);
  });

  it("returns the persisted room stateVersion in projected game-state fetches", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId } = await startGameForTwoPlayers(roomStore);
    const room = roomStore.inspectRoom(roomId);

    if (!room) {
      throw new Error("expected started room to exist");
    }

    room.stateVersion = 9;

    const response = await injectAs(roomStore, "owner-1", {
      method: "GET",
      url: `/api/rooms/${roomId}/game`
    });

    expect(response.statusCode).toBe(200);
    expect(playerGameViewSchema.parse(response.json()).stateVersion).toBe(9);
  });

  it("returns 400 for invalid gameplay command payload", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    const response = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "MAKE_CHOICE"
        }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_gameplay_command_payload" });
  });

  it("applies command for started game participant and persists state/event counters", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    await injectAs(roomStore, "player-2", {
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

    await injectAs(roomStore, "player-2", {
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

    expect(startResponse.statusCode).toBe(200);

    const roomBefore = roomStore.inspectRoom(roomId);
    expect(roomBefore?.stateVersion).toBe(1);
    expect(roomBefore?.lastAppliedEventSeq).toBe(0);

    const response = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "PASS_PRIORITY"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roomId,
      gameId: startResponse.json().gameId,
      stateVersion: 2,
      lastAppliedEventSeq: 1,
      pendingChoice: null,
      emittedEvents: [{ seq: 1, eventType: "PRIORITY_PASSED" }]
    });

    const roomAfter = roomStore.inspectRoom(roomId);
    expect(roomAfter?.stateVersion).toBe(2);
    expect(roomAfter?.lastAppliedEventSeq).toBe(1);
    expect(roomAfter?.gameEvents).toHaveLength(2);
    expect(roomAfter?.gameEvents[1]?.seq).toBe(1);
    expect(roomAfter?.gameEvents[1]?.eventType).toBe("PRIORITY_PASSED");

    const persistedPayload = roomAfter?.gameEvents[1]?.payload;

    if (
      typeof persistedPayload === "object" &&
      persistedPayload !== null &&
      "seq" in persistedPayload
    ) {
      expect(persistedPayload.seq).toBe(1);
    }
  });

  it("rejects pass-priority from participant who does not hold priority", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId } = await startGameForTwoPlayers(roomStore);

    const response = await injectAs(roomStore, "player-2", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "PASS_PRIORITY"
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("rejects declare-attackers outside declare-attackers step", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId } = await startGameForTwoPlayers(roomStore);

    const response = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "DECLARE_ATTACKERS",
          attackers: []
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("rejects declare-blockers when submitted by active player", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId } = await startGameForTwoPlayers(roomStore);
    const room = roomStore.inspectRoom(roomId);

    if (!room?.gameState) {
      throw new Error("expected room game state");
    }

    room.gameState.turnState.step = "DECLARE_BLOCKERS";
    room.gameState.turnState.phase = "DECLARE_BLOCKERS";
    room.gameState.turnState.activePlayerId = "owner-1";
    room.gameState.turnState.priorityState.playerWithPriority = "owner-1";
    room.gameState.players[0].priority = true;
    room.gameState.players[1].priority = false;

    const response = await injectAs(roomStore, "owner-1", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "DECLARE_BLOCKERS",
          assignments: []
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("applies concede for the authenticated actor even without priority", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId, gameId } = await startGameForTwoPlayers(roomStore);

    const response = await injectAs(roomStore, "player-2", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "CONCEDE"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roomId,
      gameId,
      stateVersion: 2,
      lastAppliedEventSeq: 1,
      pendingChoice: null,
      emittedEvents: [{ seq: 1, eventType: "PLAYER_LOST" }]
    });

    const room = roomStore.inspectRoom(roomId);
    expect(room?.gameState?.players[1]?.id).toBe("player-2");
    expect(room?.gameState?.players[1]?.hasLost).toBe(true);
    expect(room?.gameEvents[1]?.eventType).toBe("PLAYER_LOST");
  });

  it("rejects make-choice from participant who is not pending choice player", async () => {
    const roomStore = createInMemoryRoomStore();
    const { roomId } = await startGameForTwoPlayers(roomStore);
    const room = roomStore.inspectRoom(roomId);

    if (!room?.gameState) {
      throw new Error("expected room game state");
    }

    room.gameState.pendingChoice = yesNoPendingChoice("owner-1");

    const response = await injectAs(roomStore, "player-2", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "MAKE_CHOICE",
          payload: {
            type: "CHOOSE_YES_NO",
            accepted: true
          }
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });

  it("returns 409 when room store reports command conflict", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");
    roomStore.setForceCommandConflict(true);

    try {
      const response = await injectAs(roomStore, "owner-1", {
        method: "POST",
        url: `/api/rooms/${roomId}/commands`,
        payload: {
          command: {
            type: "PASS_PRIORITY"
          }
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "conflict" });
    } finally {
      roomStore.setForceCommandConflict(false);
    }
  });

  it("returns 403 when non-participant applies gameplay command", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await createRoomAs(roomStore, "owner-1");

    await injectAs(roomStore, "player-2", {
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

    await injectAs(roomStore, "player-2", {
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

    expect(startResponse.statusCode).toBe(200);

    const response = await injectAs(roomStore, "outsider-9", {
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      payload: {
        command: {
          type: "PASS_PRIORITY"
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "forbidden" });
  });
});
