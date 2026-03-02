import { describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/app";
import {
  createInMemoryRoomStore,
  createRoomAs,
  createSessionLookup,
  injectAs,
  type InMemoryRoomStore
} from "./helpers/app-test-helpers";
import {
  closeSocket,
  connectExpectRejected,
  connectSocket,
  waitForMessage,
  waitForMessageType
} from "./helpers/ws-test-helpers";

async function bootstrapRoom(roomStore: InMemoryRoomStore) {
  const roomId = await createRoomAs(roomStore, "owner-1");
  await injectAs(roomStore, "player-2", {
    method: "POST",
    url: `/api/rooms/${roomId}/join`
  });
  return roomId;
}

describe("room websocket", () => {
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

  it("broadcasts room updates and game started events to subscribed clients", async () => {
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
    const secondSocket = await connectSocket(
      `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
      "second"
    );

    await waitForMessage(ownerSocket);
    await waitForMessage(secondSocket);

    const ownerReadyUpdate = waitForMessage(ownerSocket);
    const secondReadyUpdate = waitForMessage(secondSocket);

    const readyResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=owner" },
      payload: { ready: true }
    });

    expect(readyResponse.statusCode).toBe(200);

    const [ownerReadyMessage, secondReadyMessage] = await Promise.all([
      ownerReadyUpdate,
      secondReadyUpdate
    ]);

    expect(ownerReadyMessage.type).toBe("room_lobby_updated");
    expect(secondReadyMessage.type).toBe("room_lobby_updated");

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=second" },
      payload: { ready: true }
    });

    const ownerStartedMessagePromise = waitForMessageType(ownerSocket, "game_started");
    const secondStartedMessagePromise = waitForMessageType(secondSocket, "game_started");

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: "authjs.session-token=owner" }
    });

    expect(startResponse.statusCode).toBe(200);
    const startedPayload = startResponse.json();

    const [ownerStartedMessage, secondStartedMessage] = await Promise.all([
      ownerStartedMessagePromise,
      secondStartedMessagePromise
    ]);

    expect(ownerStartedMessage).toMatchObject({
      type: "game_started",
      schemaVersion: 1,
      data: {
        roomId,
        gameId: startedPayload.gameId,
        gameStatus: "started"
      }
    });

    expect(secondStartedMessage).toMatchObject({
      type: "game_started",
      schemaVersion: 1,
      data: {
        roomId,
        gameId: startedPayload.gameId,
        gameStatus: "started"
      }
    });

    await closeSocket(ownerSocket);
    await closeSocket(secondSocket);
    await app.close();
  });

  it("resyncs canonical snapshot after reconnect when updates were missed", async () => {
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

    await waitForMessage(ownerSocket);
    await closeSocket(ownerSocket);

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=owner" },
      payload: { ready: true }
    });

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=second" },
      payload: { ready: true }
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: "authjs.session-token=owner" }
    });

    expect(startResponse.statusCode).toBe(200);
    const started = startResponse.json();

    const reconnectSocket = await connectSocket(
      `ws://127.0.0.1:${address.port}/ws/rooms/${roomId}`,
      "owner"
    );
    const subscribed = await waitForMessageType(reconnectSocket, "subscribed");

    expect(subscribed).toMatchObject({
      type: "subscribed",
      data: {
        roomId,
        gameId: started.gameId,
        gameStatus: "started"
      }
    });

    await closeSocket(reconnectSocket);
    await app.close();
  });

  it("emits multiple lobby updates for rapid ready toggles and idempotent start", async () => {
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
    await waitForMessage(ownerSocket);

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=owner" },
      payload: { ready: true }
    });
    await waitForMessageType(ownerSocket, "room_lobby_updated");

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=owner" },
      payload: { ready: false }
    });
    const secondToggleMessage = await waitForMessageType(ownerSocket, "room_lobby_updated");
    expect(
      secondToggleMessage.data.participants.find((p: { userId: string }) => p.userId === "owner-1")
        ?.ready
    ).toBe(false);

    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=owner" },
      payload: { ready: true }
    });
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/ready`,
      headers: { cookie: "authjs.session-token=second" },
      payload: { ready: true }
    });

    const startResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: "authjs.session-token=owner" }
    });
    const started = startResponse.json();

    const firstStartedMessage = await waitForMessageType(ownerSocket, "game_started");
    expect(firstStartedMessage.data.gameId).toBe(started.gameId);

    const idempotentStartResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: "authjs.session-token=owner" }
    });

    expect(idempotentStartResponse.statusCode).toBe(200);
    expect(idempotentStartResponse.json().gameId).toBe(started.gameId);

    const idempotentStartMessage = await waitForMessageType(ownerSocket, "game_started");
    expect(idempotentStartMessage.data.gameId).toBe(started.gameId);

    await closeSocket(ownerSocket);
    await app.close();
  });
});
