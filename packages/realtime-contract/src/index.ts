import { z } from "zod";

export const roomWsMessageSchemaVersion = 1;

export const roomSeatSchema = z.enum(["P1", "P2"]);

export const roomLobbyParticipantSchema = z.object({
  userId: z.string().min(1),
  seat: roomSeatSchema,
  ready: z.boolean()
});

export const roomLobbySnapshotSchema = z.object({
  roomId: z.string().uuid(),
  participants: z.array(roomLobbyParticipantSchema),
  gameId: z.string().uuid().nullable(),
  gameStatus: z.enum(["not_started", "started"])
});

export const roomGameStartedSchema = z.object({
  roomId: z.string().uuid(),
  gameId: z.string().uuid(),
  gameStatus: z.literal("started")
});

export const wsSubscribedMessageSchema = z.object({
  type: z.literal("subscribed"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: roomLobbySnapshotSchema
});

export const wsRoomLobbyUpdatedMessageSchema = z.object({
  type: z.literal("room_lobby_updated"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: roomLobbySnapshotSchema
});

export const wsGameStartedMessageSchema = z.object({
  type: z.literal("game_started"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: roomGameStartedSchema
});

export const wsErrorMessageSchema = z.object({
  type: z.literal("error"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: z.object({
    code: z.string().min(1),
    message: z.string().min(1)
  })
});

export const wsPongMessageSchema = z.object({
  type: z.literal("pong"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: z.object({
    nonce: z.string().min(1).optional()
  })
});

export const wsInboundPingMessageSchema = z.object({
  type: z.literal("ping"),
  data: z
    .object({
      nonce: z.string().min(1).optional()
    })
    .optional()
});

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  wsSubscribedMessageSchema,
  wsRoomLobbyUpdatedMessageSchema,
  wsGameStartedMessageSchema,
  wsErrorMessageSchema,
  wsPongMessageSchema
]);

export type RoomLobbySnapshot = z.infer<typeof roomLobbySnapshotSchema>;
export type RoomGameStarted = z.infer<typeof roomGameStartedSchema>;
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
