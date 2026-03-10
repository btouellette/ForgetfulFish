import fastifyWebsocket from "@fastify/websocket";
import {
  roomLobbySnapshotSchema,
  roomWsMessageSchemaVersion,
  wsErrorMessageSchema,
  wsGameStartedMessageSchema,
  wsInboundPingMessageSchema,
  wsPongMessageSchema,
  wsRoomLobbyUpdatedMessageSchema,
  wsSubscribedMessageSchema
} from "@forgetful-fish/realtime-contract";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import type WebSocket from "ws";

import { databaseRoomStore, type RoomStore } from "./room-store";
import {
  gameplayCommandBodySchema,
  gameplayCommandRouteResponseSchema,
  gameStartedResponseSchema,
  joinRoomParamsSchema,
  meResponseSchema,
  roomCreatedResponseSchema,
  roomJoinedResponseSchema,
  roomLobbyResponseSchema,
  roomReadyBodySchema,
  roomReadyResponseSchema,
  type GameStartedPayload
} from "./schemas";
import {
  createCachedSessionLookup,
  getSessionToken,
  lookupSessionInDatabase,
  type Actor,
  type SessionLookup
} from "./session";

type BuildServerOptions = {
  sessionLookup?: SessionLookup;
  roomStore?: RoomStore;
};

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor;
  }
}

function getLogPath(url: string) {
  const queryStart = url.indexOf("?");

  if (queryStart === -1) {
    return url;
  }

  return url.slice(0, queryStart);
}

export function buildServer({
  sessionLookup = lookupSessionInDatabase,
  roomStore = databaseRoomStore
}: BuildServerOptions = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
    disableRequestLogging: true
  });
  const logHealthChecks = process.env.LOG_HEALTHCHECKS === "true";
  // In-process socket registry. Single-instance only.
  // Multi-instance fanout requires an external pub/sub layer (for example Redis).
  const roomSockets = new Map<string, Set<WebSocket>>();
  const lookupSessionWithCache = createCachedSessionLookup(sessionLookup);

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
      payload: roomLobbySnapshotSchema.parse(lobbyResult.payload)
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
      } catch (error) {
        app.log.warn(
          { event: "ws_room_broadcast_failed", roomId, err: error },
          "ws room broadcast failed"
        );
        removeRoomSocket(roomId, socket);
      }
    }
  }

  function broadcastGameStarted(payload: GameStartedPayload) {
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
      } catch (error) {
        app.log.warn(
          { event: "ws_game_started_broadcast_failed", roomId: payload.roomId, err: error },
          "ws game_started broadcast failed"
        );
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

    const session = await lookupSessionWithCache(sessionToken);

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
            app.log.warn(
              { event: "ws_auth_failed", reason: "missing_session_token", roomId: params.data.id },
              "ws unauthorized: missing session token"
            );
            socket.close(1008, "unauthorized");
            return;
          }

          const session = await lookupSessionWithCache(sessionToken);

          if (!session || session.expires.getTime() <= Date.now()) {
            app.log.warn(
              {
                event: "ws_auth_failed",
                reason: "invalid_or_expired_session",
                roomId: params.data.id
              },
              "ws unauthorized: invalid or expired session"
            );
            socket.close(1008, "unauthorized");
            return;
          }

          const roomId = params.data.id;
          const lobbyResult = await loadRoomLobbyForUser(roomId, session.user.id);

          if (lobbyResult.status === "not_found") {
            app.log.warn(
              {
                event: "ws_subscribe_failed",
                reason: "room_not_found",
                roomId,
                userId: session.user.id
              },
              "ws room not found"
            );
            socket.close(1008, "room_not_found");
            return;
          }

          if (lobbyResult.status === "forbidden") {
            app.log.warn(
              {
                event: "ws_subscribe_failed",
                reason: "forbidden",
                roomId,
                userId: session.user.id
              },
              "ws forbidden for non-participant"
            );
            socket.close(1008, "forbidden");
            return;
          }

          addRoomSocket(roomId, socket);
          app.log.info(
            { event: "ws_subscribed", roomId, userId: session.user.id },
            "ws room subscribed"
          );

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
            app.log.info(
              { event: "ws_disconnected", roomId, userId: session.user.id },
              "ws room disconnected"
            );
            removeRoomSocket(roomId, socket);
          });

          socket.on("error", (error) => {
            app.log.warn(
              { event: "ws_socket_error", roomId, userId: session.user.id, error },
              "ws room socket error"
            );
            removeRoomSocket(roomId, socket);
          });
        })().catch((error: unknown) => {
          app.log.error({ event: "ws_handler_error", err: error }, "ws async handler failed");

          if (socket.readyState !== 3) {
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
    "/api/rooms/:id/commands",
    {
      preHandler: authorizeRequest
    },
    async (request, reply) => {
      if (!request.actor) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      const params = joinRoomParamsSchema.parse(request.params);
      const body = gameplayCommandBodySchema.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({ error: "invalid_gameplay_command_payload" });
      }

      const applyResult = await roomStore.applyCommand(
        params.id,
        request.actor.userId,
        body.data.command
      );

      if (applyResult.status === "not_found") {
        return reply.code(404).send({ error: "room_or_game_not_found" });
      }

      if (applyResult.status === "forbidden") {
        return reply.code(403).send({ error: "forbidden" });
      }

      if (applyResult.status === "conflict") {
        return reply.code(409).send({ error: "conflict" });
      }

      if (applyResult.status === "invalid_command") {
        return reply.code(409).send({ error: "invalid_command", message: applyResult.message });
      }

      return gameplayCommandRouteResponseSchema.parse({
        roomId: applyResult.roomId,
        gameId: applyResult.gameId,
        stateVersion: applyResult.stateVersion,
        lastAppliedEventSeq: applyResult.lastAppliedEventSeq,
        pendingChoice: applyResult.pendingChoice,
        emittedEvents: applyResult.emittedEvents
      });
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
