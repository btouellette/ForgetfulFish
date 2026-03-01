import { describe, expect, it } from "vitest";

import {
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
});
