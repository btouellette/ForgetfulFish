import { z } from "zod";
import {
  gameplayCommandResponseSchema,
  gameplayCommandSubmissionSchema
} from "@forgetful-fish/realtime-contract";

export const meResponseSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email()
});

export const roomCreatedResponseSchema = z.object({
  roomId: z.string().uuid(),
  ownerUserId: z.string().min(1),
  seat: z.enum(["P1", "P2"])
});

export const roomJoinedResponseSchema = z.object({
  roomId: z.string().min(1),
  userId: z.string().min(1),
  seat: z.enum(["P1", "P2"])
});

export const joinRoomParamsSchema = z.object({
  id: z.string().min(1)
});

export const roomReadyBodySchema = z.object({
  ready: z.boolean()
});

export const roomLobbyResponseSchema = z.object({
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

export const roomReadyResponseSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().min(1),
  seat: z.enum(["P1", "P2"]),
  ready: z.boolean()
});

export const gameStartedResponseSchema = z.object({
  roomId: z.string().uuid(),
  gameId: z.string().uuid(),
  gameStatus: z.literal("started")
});

export const gameplayCommandBodySchema = gameplayCommandSubmissionSchema;
export const gameplayCommandRouteResponseSchema = gameplayCommandResponseSchema;

export type GameStartedPayload = z.infer<typeof gameStartedResponseSchema>;
