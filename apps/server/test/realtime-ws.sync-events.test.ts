import { describe, expect, it } from "vitest";

import { buildServer } from "../src/app";
import {
  bootstrapRoom,
  createInMemoryRoomStore,
  createSessionLookup
} from "./helpers/app-test-helpers";
import {
  closeSocket,
  connectSocket,
  waitForMessage,
  waitForMessageType
} from "./helpers/ws-test-helpers";

describe("room websocket sync", () => {
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

  it("broadcasts room_game_updated after applied gameplay commands", async () => {
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
    await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/start`,
      headers: { cookie: "authjs.session-token=owner" }
    });

    const ownerGameUpdatedPromise = waitForMessageType(ownerSocket, "room_game_updated");
    const secondGameUpdatedPromise = waitForMessageType(secondSocket, "room_game_updated");

    const commandResponse = await app.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/commands`,
      headers: { cookie: "authjs.session-token=owner" },
      payload: {
        command: {
          type: "PASS_PRIORITY"
        }
      }
    });

    expect(commandResponse.statusCode).toBe(200);
    const commandPayload = commandResponse.json();

    const [ownerGameUpdated, secondGameUpdated] = await Promise.all([
      ownerGameUpdatedPromise,
      secondGameUpdatedPromise
    ]);

    expect(ownerGameUpdated).toMatchObject({
      type: "room_game_updated",
      schemaVersion: 1,
      data: commandPayload
    });
    expect(secondGameUpdated).toMatchObject({
      type: "room_game_updated",
      schemaVersion: 1,
      data: commandPayload
    });

    await closeSocket(ownerSocket);
    await closeSocket(secondSocket);
    await app.close();
  });
});
