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
};

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
  ownerUserId: z.string().min(1)
});

const roomJoinedResponseSchema = z.object({
  roomId: z.string().min(1),
  userId: z.string().min(1)
});

const joinRoomParamsSchema = z.object({
  id: z.string().min(1)
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

export function buildServer({ sessionLookup = lookupSessionInDatabase }: BuildServerOptions = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
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

      const payload = roomCreatedResponseSchema.parse({
        roomId: randomUUID(),
        ownerUserId: request.actor.userId
      });

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

      return roomJoinedResponseSchema.parse({
        roomId: params.id,
        userId: request.actor.userId
      });
    }
  );

  return app;
}
