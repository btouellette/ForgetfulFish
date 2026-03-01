import { randomUUID } from "node:crypto";

import fastifyWebsocket from "@fastify/websocket";
import { prisma } from "@forgetful-fish/database";
import { createInitialGameState } from "@forgetful-fish/game-engine";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type WebSocket from "ws";
import { z } from "zod";

type Actor = {
  userId: string;
  email: string;
};

type SessionLookupResult = {
  expires: Date;
  user: {
    id: string;
    email: string;
  };
};

type BuildServerOptions = {
  sessionLookup?: (sessionToken: string) => Promise<SessionLookupResult | null>;
  roomStore?: {
    createRoom: (ownerUserId: string) => Promise<CreatedRoomPayload>;
    joinRoom: (roomId: string, userId: string) => Promise<JoinRoomResult>;
    getLobby: (roomId: string, userId: string) => Promise<GetRoomLobbyResult>;
    setReady: (roomId: string, userId: string, ready: boolean) => Promise<SetRoomReadyResult>;
    startGame: (roomId: string, userId: string) => Promise<StartGameResult>;
  };
};

type RoomSeat = "P1" | "P2";

type CreatedRoomPayload = {
  roomId: string;
  ownerUserId: string;
  seat: RoomSeat;
};

type JoinRoomResult =
  | {
      status: "joined";
      roomId: string;
      userId: string;
      seat: RoomSeat;
    }
  | {
      status: "not_found";
    }
  | {
      status: "full";
    };

type RoomLobbyParticipant = {
  userId: string;
  seat: RoomSeat;
  ready: boolean;
};

type RoomLobbyPayload = {
  roomId: string;
  participants: RoomLobbyParticipant[];
  gameId: string | null;
  gameStatus: "not_started" | "started";
};

type GetRoomLobbyResult =
  | { status: "ok"; payload: RoomLobbyPayload }
  | { status: "not_found" }
  | { status: "forbidden" };

type SetRoomReadyResult =
  | {
      status: "ok";
      roomId: string;
      userId: string;
      seat: RoomSeat;
      ready: boolean;
    }
  | { status: "not_found" }
  | { status: "forbidden" };

type StartGameResult =
  | {
      status: "started";
      roomId: string;
      gameId: string;
      gameStatus: "started";
    }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "not_ready" };

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor;
  }
}

const meResponseSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email()
});

const roomCreatedResponseSchema = z.object({
  roomId: z.string().uuid(),
  ownerUserId: z.string().min(1),
  seat: z.enum(["P1", "P2"])
});

const roomJoinedResponseSchema = z.object({
  roomId: z.string().min(1),
  userId: z.string().min(1),
  seat: z.enum(["P1", "P2"])
});

const joinRoomParamsSchema = z.object({
  id: z.string().min(1)
});

const roomReadyBodySchema = z.object({
  ready: z.boolean()
});

const roomLobbyResponseSchema = z.object({
  roomId: z.string().uuid(),
  participants: z.array(
    z.object({
      userId: z.string().min(1),
      seat: z.enum(["P1", "P2"]),
      ready: z.boolean()
    })
  ),
  gameId: z.string().uuid().nullable(),
  gameStatus: z.enum(["not_started", "started"])
});

const roomReadyResponseSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().min(1),
  seat: z.enum(["P1", "P2"]),
  ready: z.boolean()
});

const gameStartedResponseSchema = z.object({
  roomId: z.string().uuid(),
  gameId: z.string().uuid(),
  gameStatus: z.literal("started")
});

const roomWsMessageSchemaVersion = 1;

const wsSubscribedMessageSchema = z.object({
  type: z.literal("subscribed"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: roomLobbyResponseSchema
});

const wsRoomLobbyUpdatedMessageSchema = z.object({
  type: z.literal("room_lobby_updated"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: roomLobbyResponseSchema
});

const wsGameStartedMessageSchema = z.object({
  type: z.literal("game_started"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: gameStartedResponseSchema
});

const wsErrorMessageSchema = z.object({
  type: z.literal("error"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: z.object({
    code: z.string().min(1),
    message: z.string().min(1)
  })
});

const wsPongMessageSchema = z.object({
  type: z.literal("pong"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: z.object({
    nonce: z.string().min(1).optional()
  })
});

const wsInboundPingMessageSchema = z.object({
  type: z.literal("ping"),
  data: z
    .object({
      nonce: z.string().min(1).optional()
    })
    .optional()
});

function isSessionCookieKey(name: string) {
  return (
    name === "__Secure-authjs.session-token" ||
    name === "authjs.session-token" ||
    name === "__Secure-next-auth.session-token" ||
    name === "next-auth.session-token"
  );
}

function getSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return undefined;
  }

  const cookieEntries = cookieHeader.split(";");

  for (const entry of cookieEntries) {
    const [rawName, ...rawValueParts] = entry.split("=");

    if (!rawName || rawValueParts.length === 0) {
      continue;
    }

    const name = rawName.trim();

    if (!isSessionCookieKey(name)) {
      continue;
    }

    const rawValue = rawValueParts.join("=").trim();

    if (!rawValue) {
      continue;
    }

    return decodeURIComponent(rawValue);
  }

  return undefined;
}

function getLogPath(url: string) {
  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return url;
  }

  return url.slice(0, queryStart);
}

async function lookupSessionInDatabase(sessionToken: string): Promise<SessionLookupResult | null> {
  const session = await prisma.session.findUnique({
    where: {
      sessionToken
    },
    select: {
      expires: true,
      user: {
        select: {
          id: true,
          email: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  return {
    expires: session.expires,
    user: {
      id: session.user.id,
      email: session.user.email
    }
  };
}

function isUniqueConstraintError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }

  return error.code === "P2002";
}

function normalizeRoomSeat(seat: string): RoomSeat {
  if (seat === "P1" || seat === "P2") {
    return seat;
  }

  throw new Error(`invalid room seat: ${seat}`);
}

async function createRoomInDatabase(ownerUserId: string): Promise<CreatedRoomPayload> {
  const roomId = randomUUID();

  await prisma.room.create({
    data: {
      id: roomId,
      participants: {
        create: {
          userId: ownerUserId,
          seat: "P1"
        }
      }
    }
  });

  return {
    roomId,
    ownerUserId,
    seat: "P1" as const
  };
}

async function joinRoomInDatabase(roomId: string, userId: string): Promise<JoinRoomResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      id: true
    }
  });

  if (!room) {
    return {
      status: "not_found" as const
    };
  }

  const existing = await prisma.roomParticipant.findUnique({
    where: {
      roomId_userId: {
        roomId,
        userId
      }
    },
    select: {
      seat: true
    }
  });

  if (existing) {
    return {
      status: "joined" as const,
      roomId,
      userId,
      seat: normalizeRoomSeat(existing.seat)
    };
  }

  const occupiedSeats: Array<{ seat: RoomSeat }> = await prisma.roomParticipant.findMany({
    where: {
      roomId
    },
    select: {
      seat: true
    }
  });

  if (occupiedSeats.length >= 2) {
    return {
      status: "full" as const
    };
  }

  const seat: RoomSeat = occupiedSeats.some((participant) => participant.seat === "P1")
    ? "P2"
    : "P1";

  try {
    await prisma.roomParticipant.create({
      data: {
        roomId,
        userId,
        seat
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingAfterConflict = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      select: {
        seat: true
      }
    });

    if (existingAfterConflict) {
      return {
        status: "joined" as const,
        roomId,
        userId,
        seat: normalizeRoomSeat(existingAfterConflict.seat)
      };
    }

    return {
      status: "full" as const
    };
  }

  return {
    status: "joined" as const,
    roomId,
    userId,
    seat
  };
}

function sortParticipantsBySeat(participants: RoomLobbyParticipant[]) {
  return [...participants].sort((left, right) => {
    if (left.seat === right.seat) {
      return 0;
    }

    return left.seat === "P1" ? -1 : 1;
  });
}

function compareSeats(left: RoomSeat, right: RoomSeat) {
  if (left === right) {
    return 0;
  }

  return left === "P1" ? -1 : 1;
}

async function getRoomLobbyInDatabase(roomId: string, userId: string): Promise<GetRoomLobbyResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      id: true,
      participants: {
        select: {
          userId: true,
          seat: true,
          ready: true
        }
      },
      game: {
        select: {
          id: true
        }
      }
    }
  });

  if (!room) {
    return {
      status: "not_found"
    };
  }

  const isParticipant = room.participants.some((participant) => participant.userId === userId);

  if (!isParticipant) {
    return {
      status: "forbidden"
    };
  }

  return {
    status: "ok",
    payload: {
      roomId: room.id,
      participants: sortParticipantsBySeat(
        room.participants.map((participant) => ({
          userId: participant.userId,
          seat: normalizeRoomSeat(participant.seat),
          ready: participant.ready
        }))
      ),
      gameId: room.game?.id ?? null,
      gameStatus: room.game ? "started" : "not_started"
    }
  };
}

async function setRoomReadyInDatabase(
  roomId: string,
  userId: string,
  ready: boolean
): Promise<SetRoomReadyResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      id: true,
      game: {
        select: {
          id: true
        }
      },
      participants: {
        where: {
          userId
        },
        select: {
          seat: true,
          ready: true
        }
      }
    }
  });

  if (!room) {
    return {
      status: "not_found"
    };
  }

  const participant = room.participants[0];

  if (!participant) {
    return {
      status: "forbidden"
    };
  }

  if (room.game) {
    return {
      status: "ok",
      roomId,
      userId,
      seat: normalizeRoomSeat(participant.seat),
      ready: participant.ready
    };
  }

  await prisma.roomParticipant.update({
    where: {
      roomId_userId: {
        roomId,
        userId
      }
    },
    data: {
      ready
    }
  });

  return {
    status: "ok",
    roomId,
    userId,
    seat: normalizeRoomSeat(participant.seat),
    ready
  };
}

async function startGameInDatabase(roomId: string, userId: string): Promise<StartGameResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      id: true,
      participants: {
        select: {
          userId: true,
          seat: true,
          ready: true
        }
      },
      game: {
        select: {
          id: true
        }
      }
    }
  });

  if (!room) {
    return {
      status: "not_found"
    };
  }

  const isParticipant = room.participants.some((participant) => participant.userId === userId);

  if (!isParticipant) {
    return {
      status: "forbidden"
    };
  }

  if (room.game) {
    return {
      status: "started",
      roomId,
      gameId: room.game.id,
      gameStatus: "started"
    };
  }

  const participantsBySeat = [...room.participants]
    .map((participant) => ({
      userId: participant.userId,
      seat: normalizeRoomSeat(participant.seat),
      ready: participant.ready
    }))
    .sort((left, right) => compareSeats(left.seat, right.seat));

  if (
    participantsBySeat.length !== 2 ||
    participantsBySeat.some((participant) => !participant.ready)
  ) {
    return {
      status: "not_ready"
    };
  }

  const firstParticipant = participantsBySeat[0];
  const secondParticipant = participantsBySeat[1];

  if (!firstParticipant || !secondParticipant) {
    return {
      status: "not_ready"
    };
  }

  const initialState = createInitialGameState(firstParticipant.userId, secondParticipant.userId);
  const stateVersion = 1;

  const gameId = randomUUID();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.game.create({
        data: {
          id: gameId,
          roomId,
          startedByUserId: userId,
          state: initialState,
          stateVersion,
          lastAppliedEventSeq: 0
        }
      });

      await tx.gameEvent.create({
        data: {
          gameId,
          seq: 0,
          eventType: "game_initialized",
          schemaVersion: stateVersion,
          causedByUserId: userId,
          payload: {
            stateVersion,
            state: initialState,
            playersBySeat: participantsBySeat.map((participant) => ({
              seat: participant.seat,
              userId: participant.userId
            }))
          }
        }
      });
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingGame = await prisma.game.findUnique({
      where: {
        roomId
      },
      select: {
        id: true
      }
    });

    if (existingGame) {
      return {
        status: "started",
        roomId,
        gameId: existingGame.id,
        gameStatus: "started"
      };
    }

    throw error;
  }

  return {
    status: "started",
    roomId,
    gameId,
    gameStatus: "started"
  };
}

export function buildServer({
  sessionLookup = lookupSessionInDatabase,
  roomStore = {
    createRoom: createRoomInDatabase,
    joinRoom: joinRoomInDatabase,
    getLobby: getRoomLobbyInDatabase,
    setReady: setRoomReadyInDatabase,
    startGame: startGameInDatabase
  }
}: BuildServerOptions = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    disableRequestLogging: true
  });
  const logHealthChecks = process.env.LOG_HEALTHCHECKS === "true";
  const roomSockets = new Map<string, Set<WebSocket>>();

  function removeRoomSocket(roomId: string, socket: WebSocket) {
    const sockets = roomSockets.get(roomId);

    if (!sockets) {
      return;
    }

    sockets.delete(socket);

    if (sockets.size === 0) {
      roomSockets.delete(roomId);
    }
  }

  function addRoomSocket(roomId: string, socket: WebSocket) {
    const sockets = roomSockets.get(roomId);

    if (sockets) {
      sockets.add(socket);
      return;
    }

    roomSockets.set(roomId, new Set([socket]));
  }

  function sendRoomMessage(socket: WebSocket, payload: unknown) {
    if (socket.readyState !== 1) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }

  async function loadRoomLobbyForUser(roomId: string, userId: string) {
    const lobbyResult = await roomStore.getLobby(roomId, userId);

    if (lobbyResult.status !== "ok") {
      return lobbyResult;
    }

    return {
      status: "ok" as const,
      payload: roomLobbyResponseSchema.parse(lobbyResult.payload)
    };
  }

  async function broadcastRoomLobbyUpdate(roomId: string, actorUserId: string) {
    const sockets = roomSockets.get(roomId);

    if (!sockets || sockets.size === 0) {
      return;
    }

    const lobbyResult = await loadRoomLobbyForUser(roomId, actorUserId);

    if (lobbyResult.status !== "ok") {
      return;
    }

    const message = wsRoomLobbyUpdatedMessageSchema.parse({
      type: "room_lobby_updated",
      schemaVersion: roomWsMessageSchemaVersion,
      data: lobbyResult.payload
    });

    for (const socket of sockets) {
      try {
        sendRoomMessage(socket, message);
      } catch {
        removeRoomSocket(roomId, socket);
      }
    }
  }

  function broadcastGameStarted(payload: z.infer<typeof gameStartedResponseSchema>) {
    const sockets = roomSockets.get(payload.roomId);

    if (!sockets || sockets.size === 0) {
      return;
    }

    const message = wsGameStartedMessageSchema.parse({
      type: "game_started",
      schemaVersion: roomWsMessageSchemaVersion,
      data: payload
    });

    for (const socket of sockets) {
      try {
        sendRoomMessage(socket, message);
      } catch {
        removeRoomSocket(payload.roomId, socket);
      }
    }
  }

  function shouldLogRequest(url: string) {
    return logHealthChecks || getLogPath(url) !== "/health";
  }

  app.addHook("onRequest", async (request) => {
    if (!shouldLogRequest(request.url)) {
      return;
    }

    request.log.info(
      {
        method: request.method,
        path: getLogPath(request.url)
      },
      "incoming request"
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode === 404 || !shouldLogRequest(request.url)) {
      return;
    }

    request.log.info(
      {
        method: request.method,
        path: getLogPath(request.url),
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime
      },
      "request completed"
    );
  });

  async function authorizeRequest(request: FastifyRequest, reply: FastifyReply) {
    const sessionToken = getSessionToken(request.headers.cookie);

    if (!sessionToken) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const session = await sessionLookup(sessionToken);

    if (!session || session.expires.getTime() <= Date.now()) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    request.actor = {
      userId: session.user.id,
      email: session.user.email
    };

    return;
  }

  function routeIncludesAuthorizeRequest(preHandler: unknown) {
    if (!preHandler) {
      return false;
    }

    if (Array.isArray(preHandler)) {
      return preHandler.some((handler) => handler === authorizeRequest);
    }

    if (typeof preHandler !== "function") {
      return false;
    }

    return preHandler === authorizeRequest;
  }

  app.addHook("onRoute", (routeOptions) => {
    const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];
    const methods = Array.isArray(routeOptions.method)
      ? routeOptions.method
      : [routeOptions.method];
    const matchedMutatingMethod = methods.find((method) => mutatingMethods.includes(method));

    if (!matchedMutatingMethod) {
      return;
    }

    if (routeIncludesAuthorizeRequest(routeOptions.preHandler)) {
      return;
    }

    throw new Error(
      `${matchedMutatingMethod} route "${routeOptions.url}" must use authorizeRequest preHandler`
    );
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  void app.register(async (wsApp) => {
    await wsApp.register(fastifyWebsocket);

    wsApp.get(
      "/ws/rooms/:id",
      {
        websocket: true
      },
      (rawSocket: unknown, request) => {
        const socket =
          typeof rawSocket === "object" && rawSocket !== null && "socket" in rawSocket
            ? (rawSocket.socket as WebSocket)
            : (rawSocket as WebSocket);

        void (async () => {
          const params = joinRoomParamsSchema.safeParse(request.params);

          if (!params.success) {
            socket.close(1008, "invalid_room_id");
            return;
          }

          const sessionToken = getSessionToken(request.headers.cookie);

          if (!sessionToken) {
            socket.close(1008, "unauthorized");
            return;
          }

          const session = await sessionLookup(sessionToken);

          if (!session || session.expires.getTime() <= Date.now()) {
            socket.close(1008, "unauthorized");
            return;
          }

          const roomId = params.data.id;
          const lobbyResult = await loadRoomLobbyForUser(roomId, session.user.id);

          if (lobbyResult.status === "not_found") {
            socket.close(1008, "room_not_found");
            return;
          }

          if (lobbyResult.status === "forbidden") {
            socket.close(1008, "forbidden");
            return;
          }

          addRoomSocket(roomId, socket);

          const subscribedMessage = wsSubscribedMessageSchema.parse({
            type: "subscribed",
            schemaVersion: roomWsMessageSchemaVersion,
            data: lobbyResult.payload
          });
          sendRoomMessage(socket, subscribedMessage);

          socket.on("message", (rawMessage: Buffer | string) => {
            const payload = (() => {
              try {
                return JSON.parse(rawMessage.toString()) as unknown;
              } catch {
                return null;
              }
            })();

            if (!payload) {
              const errorMessage = wsErrorMessageSchema.parse({
                type: "error",
                schemaVersion: roomWsMessageSchemaVersion,
                data: {
                  code: "invalid_json",
                  message: "invalid JSON payload"
                }
              });
              sendRoomMessage(socket, errorMessage);
              return;
            }

            const pingMessage = wsInboundPingMessageSchema.safeParse(payload);

            if (!pingMessage.success) {
              const errorMessage = wsErrorMessageSchema.parse({
                type: "error",
                schemaVersion: roomWsMessageSchemaVersion,
                data: {
                  code: "unsupported_message",
                  message: "unsupported message type"
                }
              });
              sendRoomMessage(socket, errorMessage);
              return;
            }

            const pongMessage = wsPongMessageSchema.parse({
              type: "pong",
              schemaVersion: roomWsMessageSchemaVersion,
              data: {
                nonce: pingMessage.data.data?.nonce
              }
            });
            sendRoomMessage(socket, pongMessage);
          });

          socket.on("close", () => {
            removeRoomSocket(roomId, socket);
          });

          socket.on("error", () => {
            removeRoomSocket(roomId, socket);
          });
        })().catch(() => {
          if (socket.readyState === 0 || socket.readyState === 1) {
            socket.close(1011, "internal_error");
          }
        });
      }
    );
  });

  app.get(
    "/api/me",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      return meResponseSchema.parse(request.actor);
    }
  );

  app.post(
    "/api/rooms",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const payload = roomCreatedResponseSchema.parse(
        await roomStore.createRoom(request.actor.userId)
      );

      return reply.code(201).send(payload);
    }
  );

  app.post(
    "/api/rooms/:id/join",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = joinRoomParamsSchema.parse(request.params);

      const joinResult = await roomStore.joinRoom(params.id, request.actor.userId);

      if (joinResult.status === "not_found") {
        return reply.code(404).send({ error: "room_not_found" });
      }

      if (joinResult.status === "full") {
        return reply.code(409).send({ error: "room_full" });
      }

      const payload = roomJoinedResponseSchema.parse(joinResult);
      await broadcastRoomLobbyUpdate(params.id, request.actor.userId);
      return payload;
    }
  );

  app.get(
    "/api/rooms/:id",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = joinRoomParamsSchema.parse(request.params);
      const lobbyResult = await roomStore.getLobby(params.id, request.actor.userId);

      if (lobbyResult.status === "not_found") {
        return reply.code(404).send({ error: "room_not_found" });
      }

      if (lobbyResult.status === "forbidden") {
        return reply.code(403).send({ error: "forbidden" });
      }

      return roomLobbyResponseSchema.parse(lobbyResult.payload);
    }
  );

  app.post(
    "/api/rooms/:id/ready",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = joinRoomParamsSchema.parse(request.params);
      const body = roomReadyBodySchema.parse(request.body);
      const readyResult = await roomStore.setReady(params.id, request.actor.userId, body.ready);

      if (readyResult.status === "not_found") {
        return reply.code(404).send({ error: "room_not_found" });
      }

      if (readyResult.status === "forbidden") {
        return reply.code(403).send({ error: "forbidden" });
      }

      const payload = roomReadyResponseSchema.parse(readyResult);
      await broadcastRoomLobbyUpdate(params.id, request.actor.userId);
      return payload;
    }
  );

  app.post(
    "/api/rooms/:id/start",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = joinRoomParamsSchema.parse(request.params);
      const startedResult = await roomStore.startGame(params.id, request.actor.userId);

      if (startedResult.status === "not_found") {
        return reply.code(404).send({ error: "room_not_found" });
      }

      if (startedResult.status === "forbidden") {
        return reply.code(403).send({ error: "forbidden" });
      }

      if (startedResult.status === "not_ready") {
        return reply.code(409).send({ error: "room_not_ready" });
      }

      const payload = gameStartedResponseSchema.parse(startedResult);
      broadcastGameStarted(payload);
      await broadcastRoomLobbyUpdate(params.id, request.actor.userId);
      return payload;
    }
  );

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: "not found" });
  });

  return app;
}
