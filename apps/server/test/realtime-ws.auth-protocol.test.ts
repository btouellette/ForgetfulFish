import { describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/app";
import {
  bootstrapRoom,
  createInMemoryRoomStore,
  createSessionLookup
} from "./helpers/app-test-helpers";
import {
  closeSocket,
  connectExpectRejected,
  connectSocket,
  waitForMessage,
  waitForMessageType
} from "./helpers/ws-test-helpers";

describe("room websocket auth and protocol", () => {
  it("logs and closes websocket when async handler throws", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await bootstrapRoom(roomStore);
    const lookupError = new Error("session lookup exploded");
    const app = buildServer({
      sessionLookup: async () => {
        throw lookupError;
      },
      roomStore
    });
    const errorSpy = vi.spyOn(app.log, "error");

    try {
      await app.listen({ port: 0, host: "127.0.0.1" });
      const address = app.server.address();

      if (!address || typeof address === "string") {
        throw new Error("server did not expose an address");
      }

      const rejected = await connectExpectRejected(
        `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
        "owner"
      );

      expect(rejected.code).toBe(1011);
      expect(rejected.reason).toBe("internal_error");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ event: "ws_handler_error", err: lookupError }),
        "ws async handler failed"
      );
    } finally {
      errorSpy.mockRestore();
      await app.close();
    }
  });

  it("rejects websocket room connections without a valid session", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await bootstrapRoom(roomStore);
    const app = buildServer({
      sessionLookup: createSessionLookup({ owner: "owner-1", second: "player-2" }),
      roomStore
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();

    if (!address || typeof address === "string") {
      throw new Error("server did not expose an address");
    }

    const rejected = await connectExpectRejected(
      `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`
    );

    if (typeof rejected.statusCode === "number") {
      expect(rejected.statusCode).toBe(401);
    } else {
      expect(rejected.code).toBe(1008);
      expect(rejected.reason).toBe("unauthorized");
    }

    await app.close();
  });

  it("reuses cached session lookup for repeated websocket auth", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await bootstrapRoom(roomStore);
    let sessionLookupCalls = 0;
    const app = buildServer({
      sessionLookup: async (sessionToken) => {
        sessionLookupCalls += 1;

        if (sessionToken !== "owner") {
          return null;
        }

        return {
          expires: new Date("2100-01-01T00:00:00.000Z"),
          user: {
            id: "owner-1",
            email: "owner-1@example.com"
          }
        };
      },
      roomStore
    });

    try {
      await app.listen({ port: 0, host: "127.0.0.1" });
      const address = app.server.address();

      if (!address || typeof address === "string") {
        throw new Error("server did not expose an address");
      }

      const firstSocket = await connectSocket(
        `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
        "owner"
      );
      await waitForMessageType(firstSocket, "subscribed");
      await closeSocket(firstSocket);

      const secondSocket = await connectSocket(
        `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
        "owner"
      );
      await waitForMessageType(secondSocket, "subscribed");
      await closeSocket(secondSocket);

      expect(sessionLookupCalls).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("sends subscribed snapshot for participant and rejects non-participants", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await bootstrapRoom(roomStore);
    const app = buildServer({
      sessionLookup: createSessionLookup({
        owner: "owner-1",
        second: "player-2",
        outsider: "user-3"
      }),
      roomStore
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();

    if (!address || typeof address === "string") {
      throw new Error("server did not expose an address");
    }

    const ownerSocket = await connectSocket(
      `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
      "owner"
    );
    const subscribedMessage = await waitForMessage(ownerSocket);

    expect(subscribedMessage).toMatchObject({
      type: "subscribed",
      schemaVersion: 1,
      data: {
        roomId,
        gameId: null,
        gameStatus: "not_started"
      }
    });

    const outsiderRejected = await connectExpectRejected(
      `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
      "outsider"
    );

    if (typeof outsiderRejected.statusCode === "number") {
      expect(outsiderRejected.statusCode).toBe(403);
    } else {
      expect(outsiderRejected.code).toBe(1008);
      expect(outsiderRejected.reason).toBe("forbidden");
    }

    await closeSocket(ownerSocket);
    await app.close();
  });

  it("returns protocol error message for invalid websocket payload", async () => {
    const roomStore = createInMemoryRoomStore();
    const roomId = await bootstrapRoom(roomStore);
    const app = buildServer({
      sessionLookup: createSessionLookup({ owner: "owner-1", second: "player-2" }),
      roomStore
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();

    if (!address || typeof address === "string") {
      throw new Error("server did not expose an address");
    }

    const ownerSocket = await connectSocket(
      `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
      "owner"
    );

    await waitForMessageType(ownerSocket, "subscribed");
    ownerSocket.send("{");

    const errorMessage = await waitForMessageType(ownerSocket, "error");
    expect(errorMessage).toMatchObject({
      type: "error",
      schemaVersion: 1,
      data: {
        code: "invalid_json",
        message: "invalid JSON payload"
      }
    });

    await closeSocket(ownerSocket);
    await app.close();
  });
});
