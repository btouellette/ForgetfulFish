import { randomUUID } from "node:crypto";

import { prisma } from "@forgetful-fish/database";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
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

  if (
    room.participants.length !== 2 ||
    room.participants.some((participant) => !participant.ready)
  ) {
    return {
      status: "not_ready"
    };
  }

  const gameId = randomUUID();

  try {
    await prisma.game.create({
      data: {
        id: gameId,
        roomId,
        startedByUserId: userId
      }
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

  app.addHook("onRequest", async (request) => {
    request.log.info(
      {
        reqId: request.id,
        method: request.method,
        path: getLogPath(request.url)
      },
      "incoming request"
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    if (reply.statusCode === 404) {
      return;
    }

    request.log.info(
      {
        reqId: request.id,
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

  app.get("/health", async () => {
    return { status: "ok" };
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

      return roomJoinedResponseSchema.parse(joinResult);
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

      return roomReadyResponseSchema.parse(readyResult);
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

      return gameStartedResponseSchema.parse(startedResult);
    }
  );

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.code(404).send({ error: "not found" });
  });

  return app;
}
