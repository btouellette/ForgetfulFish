import { describe, expect, it } from "vitest";

import {
  gameplayCommandResponseSchema,
  gameplayCommandSubmissionSchema,
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
});
