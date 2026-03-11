import { describe, expect, it } from "vitest";

import {
  gameplayCommandResponseSchema,
  gameplayCommandSubmissionSchema,
  playerGameViewSchema,
  roomWsMessageSchemaVersion,
  wsServerMessageSchema,
  wsSubscribedMessageSchema
} from "../src/index";

describe("realtime contract schemas", () => {
  it("accepts canonical subscribed message payload", () => {
    const parsed = wsSubscribedMessageSchema.parse({
      type: "subscribed",
      schemaVersion: roomWsMessageSchemaVersion,
      data: {
        roomId: "00000000-0000-4000-8000-000000000001",
        participants: [
          { userId: "owner-1", seat: "P1", ready: true },
          { userId: "player-2", seat: "P2", ready: false }
        ],
        gameId: null,
        gameStatus: "not_started"
      }
    });

    expect(parsed.type).toBe("subscribed");
  });

  it("rejects non-versioned server messages", () => {
    const parsed = wsServerMessageSchema.safeParse({
      type: "room_lobby_updated",
      data: {
        roomId: "00000000-0000-4000-8000-000000000001",
        participants: [],
        gameId: null,
        gameStatus: "not_started"
      }
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts gameplay command submissions with strict command DTOs", () => {
    const parsed = gameplayCommandSubmissionSchema.parse({
      command: {
        type: "PASS_PRIORITY"
      }
    });

    expect(parsed.command.type).toBe("PASS_PRIORITY");
  });

  it("rejects malformed gameplay commands", () => {
    const parsed = gameplayCommandSubmissionSchema.safeParse({
      command: {
        type: "MAKE_CHOICE"
      }
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts gameplay command response payload shape", () => {
    const parsed = gameplayCommandResponseSchema.parse({
      roomId: "00000000-0000-4000-8000-000000000001",
      gameId: "10000000-0000-4000-8000-000000000001",
      stateVersion: 2,
      lastAppliedEventSeq: 1,
      pendingChoice: null,
      emittedEvents: [{ seq: 1, eventType: "PRIORITY_PASSED" }]
    });

    expect(parsed.emittedEvents).toHaveLength(1);
  });

  it("accepts room_game_updated websocket payloads", () => {
    const parsed = wsServerMessageSchema.parse({
      type: "room_game_updated",
      schemaVersion: roomWsMessageSchemaVersion,
      data: {
        roomId: "00000000-0000-4000-8000-000000000001",
        gameId: "10000000-0000-4000-8000-000000000001",
        stateVersion: 2,
        lastAppliedEventSeq: 1,
        pendingChoice: null,
        emittedEvents: [{ seq: 1, eventType: "PRIORITY_PASSED" }]
      }
    });

    expect(parsed.type).toBe("room_game_updated");
  });

  it("accepts well-formed player game views", () => {
    const parsed = playerGameViewSchema.parse({
      viewerPlayerId: "player-1",
      stateVersion: 2,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-2"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [
          {
            id: "obj-1",
            zcc: 0,
            cardDefId: "island",
            owner: "player-1",
            controller: "player-1",
            counters: { charge: 1 },
            damage: 0,
            tapped: false,
            summoningSick: false,
            attachments: [],
            zone: { kind: "hand", scope: "player", playerId: "player-1" }
          }
        ],
        handCount: 1
      },
      opponent: {
        id: "player-2",
        life: 18,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        handCount: 2
      },
      zones: [
        {
          zoneRef: { kind: "battlefield", scope: "shared" },
          objectIds: ["battlefield-1"],
          count: 1
        },
        {
          zoneRef: { kind: "library", scope: "player", playerId: "player-2" },
          count: 30
        }
      ],
      objectPool: {
        "battlefield-1": {
          id: "battlefield-1",
          zcc: 0,
          cardDefId: "island",
          owner: "player-1",
          controller: "player-1",
          counters: { charge: 1 },
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "battlefield", scope: "shared" }
        }
      },
      stack: [
        {
          object: { id: "spell-on-stack", zcc: 0 },
          controller: "player-1"
        }
      ],
      pendingChoice: null
    });

    expect(parsed.viewer.hand).toHaveLength(1);
    expect(parsed.zones[1]?.count).toBe(30);
  });

  it("rejects payloads with invalid objectPool keys", () => {
    const parsed = playerGameViewSchema.safeParse({
      viewerPlayerId: "player-1",
      stateVersion: 2,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-2"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        handCount: 0
      },
      opponent: {
        id: "player-2",
        life: 18,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        handCount: 2
      },
      zones: [],
      objectPool: {
        "": {
          id: "obj-1",
          zcc: 0,
          cardDefId: "island",
          owner: "player-1",
          controller: "player-1",
          counters: {},
          damage: 0,
          tapped: false,
          summoningSick: false,
          attachments: [],
          zone: { kind: "battlefield", scope: "shared" }
        }
      },
      stack: [],
      pendingChoice: null
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects payloads containing rngSeed", () => {
    const parsed = playerGameViewSchema.safeParse({
      viewerPlayerId: "player-1",
      stateVersion: 2,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-2"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        handCount: 0
      },
      opponent: {
        id: "player-2",
        life: 18,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        handCount: 2
      },
      zones: [],
      objectPool: {},
      stack: [],
      pendingChoice: null,
      rngSeed: "seed-1"
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects payloads containing lkiStore", () => {
    const parsed = playerGameViewSchema.safeParse({
      viewerPlayerId: "player-1",
      stateVersion: 2,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-2"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        handCount: 0
      },
      opponent: {
        id: "player-2",
        life: 18,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        handCount: 2
      },
      zones: [],
      objectPool: {},
      stack: [],
      pendingChoice: null,
      lkiStore: {}
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects payloads containing triggerQueue", () => {
    const parsed = playerGameViewSchema.safeParse({
      viewerPlayerId: "player-1",
      stateVersion: 2,
      turnState: {
        phase: "MAIN_1",
        activePlayerId: "player-1",
        priorityPlayerId: "player-2"
      },
      viewer: {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 1, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        handCount: 0
      },
      opponent: {
        id: "player-2",
        life: 18,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        handCount: 2
      },
      zones: [],
      objectPool: {},
      stack: [],
      pendingChoice: null,
      triggerQueue: []
    });

    expect(parsed.success).toBe(false);
  });
});
