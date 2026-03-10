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

const playerIdSchema = z.string().min(1);
const objectIdSchema = z.string().min(1);

export const objectRefSchema = z
  .object({
    id: objectIdSchema,
    zcc: z.number().int().min(0)
  })
  .strict();

export const commandTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("object"),
      object: objectRefSchema
    })
    .strict(),
  z
    .object({
      kind: z.literal("player"),
      playerId: playerIdSchema
    })
    .strict()
]);

export const commandModeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional()
  })
  .strict();

export const commandChoicePayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("CHOOSE_CARDS"),
      selected: z.array(objectIdSchema),
      min: z.number().int().min(0),
      max: z.number().int().min(0)
    })
    .strict(),
  z
    .object({
      type: z.literal("ORDER_CARDS"),
      ordered: z.array(objectIdSchema)
    })
    .strict(),
  z
    .object({
      type: z.literal("NAME_CARD"),
      cardName: z.string()
    })
    .strict(),
  z
    .object({
      type: z.literal("CHOOSE_REPLACEMENT"),
      replacementId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      type: z.literal("CHOOSE_MODE"),
      mode: commandModeSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("CHOOSE_TARGET"),
      target: commandTargetSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("CHOOSE_YES_NO"),
      accepted: z.boolean()
    })
    .strict(),
  z
    .object({
      type: z.literal("ORDER_TRIGGERS"),
      triggerIds: z.array(z.string().min(1))
    })
    .strict()
]);

export const gameplayCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("CAST_SPELL"),
      cardId: objectIdSchema,
      targets: z.array(commandTargetSchema).optional(),
      modePick: commandModeSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("ACTIVATE_ABILITY"),
      sourceId: objectIdSchema,
      abilityIndex: z.number().int().min(0),
      targets: z.array(commandTargetSchema).optional()
    })
    .strict(),
  z.object({ type: z.literal("PASS_PRIORITY") }).strict(),
  z
    .object({
      type: z.literal("MAKE_CHOICE"),
      payload: commandChoicePayloadSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("DECLARE_ATTACKERS"),
      attackers: z.array(objectIdSchema)
    })
    .strict(),
  z
    .object({
      type: z.literal("DECLARE_BLOCKERS"),
      assignments: z.array(
        z
          .object({
            attackerId: objectIdSchema,
            blockerIds: z.array(objectIdSchema)
          })
          .strict()
      )
    })
    .strict(),
  z
    .object({
      type: z.literal("PLAY_LAND"),
      cardId: objectIdSchema
    })
    .strict(),
  z.object({ type: z.literal("CONCEDE") }).strict()
]);

export const gameplayCommandSubmissionSchema = z
  .object({
    command: gameplayCommandSchema
  })
  .strict();

export const gameplayPendingChoiceSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      "CHOOSE_CARDS",
      "CHOOSE_TARGET",
      "CHOOSE_MODE",
      "CHOOSE_YES_NO",
      "ORDER_CARDS",
      "ORDER_TRIGGERS",
      "CHOOSE_REPLACEMENT",
      "NAME_CARD"
    ]),
    forPlayer: playerIdSchema,
    prompt: z.string(),
    constraints: z.unknown()
  })
  .strict();

export const gameplayEmittedEventMetadataSchema = z
  .object({
    seq: z.number().int().min(0),
    eventType: z.string().min(1)
  })
  .strict();

export const gameplayCommandResponseSchema = z
  .object({
    roomId: z.string().uuid(),
    gameId: z.string().uuid(),
    stateVersion: z.number().int().min(1),
    lastAppliedEventSeq: z.number().int().min(0),
    pendingChoice: gameplayPendingChoiceSchema.nullable(),
    emittedEvents: z.array(gameplayEmittedEventMetadataSchema)
  })
  .strict();

export const wsRoomGameUpdatedMessageSchema = z.object({
  type: z.literal("room_game_updated"),
  schemaVersion: z.literal(roomWsMessageSchemaVersion),
  data: gameplayCommandResponseSchema
});

export const wsServerMessageSchema = z.discriminatedUnion("type", [
  wsSubscribedMessageSchema,
  wsRoomLobbyUpdatedMessageSchema,
  wsGameStartedMessageSchema,
  wsRoomGameUpdatedMessageSchema,
  wsErrorMessageSchema,
  wsPongMessageSchema
]);

export type RoomLobbySnapshot = z.infer<typeof roomLobbySnapshotSchema>;
export type RoomGameStarted = z.infer<typeof roomGameStartedSchema>;
export type WsServerMessage = z.infer<typeof wsServerMessageSchema>;
export type GameplayCommand = z.infer<typeof gameplayCommandSchema>;
export type GameplayCommandSubmission = z.infer<typeof gameplayCommandSubmissionSchema>;
export type GameplayPendingChoice = z.infer<typeof gameplayPendingChoiceSchema>;
export type GameplayCommandResponse = z.infer<typeof gameplayCommandResponseSchema>;
