import { describe, expect, it } from "vitest";
import WebSocket from "ws";

import { buildServer } from "../src/app";

type RoomSeat = "P1" | "P2";

type InMemoryRoomStore = ReturnType<typeof createInMemoryRoomStore>;
const socketMessageQueue = new WeakMap<WebSocket, unknown[]>();
const socketMessageResolvers = new WeakMap<WebSocket, Array<(value: unknown) => void>>();

function createInMemoryRoomStore() {
  type Participant = {
    userId: string;
    ready: boolean;
  };

  type RoomState = {
    participants: Map<RoomSeat, Participant>;
    gameId: string | null;
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
        gameId: null
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
        return { status: "not_found" as const };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId === userId) {
          return { status: "joined" as const, roomId, userId, seat };
        }
      }

      if (room.participants.size >= 2) {
        return { status: "full" as const };
      }

      const seat: RoomSeat = room.participants.has("P1") ? "P2" : "P1";
      room.participants.set(seat, { userId, ready: false });
      return { status: "joined" as const, roomId, userId, seat };
    },
    async getLobby(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return { status: "not_found" as const };
      }

      const isParticipant = [...room.participants.values()].some(
        (participant) => participant.userId === userId
      );

      if (!isParticipant) {
        return { status: "forbidden" as const };
      }

      const participants = [...room.participants.entries()].map(([seat, participant]) => ({
        userId: participant.userId,
        seat,
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
        return { status: "not_found" as const };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId !== userId) {
          continue;
        }

        if (!room.gameId) {
          room.participants.set(seat, { ...participant, ready });
        }

        return {
          status: "ok" as const,
          roomId,
          userId,
          seat,
          ready: room.gameId ? participant.ready : ready
        };
      }

      return { status: "forbidden" as const };
    },
    async startGame(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return { status: "not_found" as const };
      }

      const participants = [...room.participants.values()];
      const isParticipant = participants.some((participant) => participant.userId === userId);

      if (!isParticipant) {
        return { status: "forbidden" as const };
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
        return { status: "not_ready" as const };
      }

      room.gameId = `10000000-0000-4000-8000-${String(nextGameIndex).padStart(12, "0")}`;
      nextGameIndex += 1;

      return {
        status: "started" as const,
        roomId,
        gameId: room.gameId,
        gameStatus: "started" as const
      };
    }
  };
}

function createSessionLookup(userIdByToken: Record<string, string>) {
  return async (sessionToken: string) => {
    const userId = userIdByToken[sessionToken];

    if (!userId) {
      return null;
    }

    return {
      expires: new Date("2100-01-01T00:00:00.000Z"),
      user: {
        id: userId,
        email: `${userId}@example.com`
      }
    };
  };
}

function connectSocket(url: string, sessionToken?: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: sessionToken ? { cookie: `authjs.session-token=${sessionToken}` } : {}
    });
    socketMessageQueue.set(socket, []);
    socketMessageResolvers.set(socket, []);

    socket.on("message", (data) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }

      const resolvers = socketMessageResolvers.get(socket);

      if (resolvers && resolvers.length > 0) {
        const next = resolvers.shift();

        if (next) {
          next(parsed);
          return;
        }
      }

      const queue = socketMessageQueue.get(socket);

      if (queue) {
        queue.push(parsed);
      }
    });

    socket.once("open", () => {
      resolve(socket);
    });

    socket.once("error", (error) => {
      reject(error);
    });
  });
}

function connectExpectRejected(url: string, sessionToken?: string) {
  return new Promise<{ statusCode?: number; code?: number; reason?: string }>((resolve) => {
    const socket = new WebSocket(url, {
      headers: sessionToken ? { cookie: `authjs.session-token=${sessionToken}` } : {}
    });
    const timeout = setTimeout(() => {
      socket.terminate();
      resolve({ reason: "timeout" });
    }, 1000);

    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      resolve({ statusCode: response.statusCode });
    });

    socket.once("close", (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: String(reason) });
    });

    socket.once("error", () => {
      clearTimeout(timeout);
      resolve({});
    });
  });
}

function waitForMessage(socket: WebSocket) {
  return new Promise<any>((resolve, reject) => {
    const queued = socketMessageQueue.get(socket);

    if (queued && queued.length > 0) {
      resolve(queued.shift());
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("timed out waiting for websocket message"));
    }, 1000);

    const resolvers = socketMessageResolvers.get(socket);

    if (!resolvers) {
      clearTimeout(timeout);
      reject(new Error("missing socket resolver queue"));
      return;
    }

    resolvers.push((value) => {
      clearTimeout(timeout);
      resolve(value);
    });

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function waitForMessageType(socket: WebSocket, type: string) {
  for (let index = 0; index < 5; index += 1) {
    const message = await waitForMessage(socket);

    if (message && typeof message === "object" && "type" in message && message.type === type) {
      return message;
    }
  }

  throw new Error(`timed out waiting for websocket message type ${type}`);
}

function closeSocket(socket: WebSocket) {
  return new Promise<void>((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    socket.once("close", () => {
      resolve();
    });

    socket.close();
  });
}

async function bootstrapRoom(roomStore: InMemoryRoomStore) {
  const ownerApp = buildServer({
    sessionLookup: createSessionLookup({ owner: "owner-1" }),
    roomStore
  });

  const secondApp = buildServer({
    sessionLookup: createSessionLookup({ second: "player-2" }),
    roomStore
  });

  try {
    const roomResponse = await ownerApp.inject({
      method: "POST",
      url: "/api/rooms",
      headers: { cookie: "authjs.session-token=owner" }
    });
    const roomId = roomResponse.json().roomId as string;

    await secondApp.inject({
      method: "POST",
      url: `/api/rooms/${roomId}/join`,
      headers: { cookie: "authjs.session-token=second" }
    });

    return roomId;
  } finally {
    await ownerApp.close();
    await secondApp.close();
  }
}

describe("room websocket", () => {
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
