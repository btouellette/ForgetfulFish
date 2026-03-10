import { prisma } from "@forgetful-fish/database";
import type { Prisma } from "@forgetful-fish/database";
import {
  processCommand,
  Rng,
  type Command,
  type GameEvent,
  type GameState,
  type PendingChoice
} from "@forgetful-fish/game-engine";
import { gameplayCommandSchema } from "@forgetful-fish/realtime-contract";

import { fromPersistedGameState, toPersistedGameState } from "./state-persistence";
import type { ApplyGameplayCommandResult } from "./types";

function toPersistedEventPayload(event: GameEvent, persistedSeq: number): Prisma.InputJsonValue {
  const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
  payload.seq = persistedSeq;

  const payloadId = payload.id;

  if (typeof payloadId === "string") {
    const separatorIndex = payloadId.lastIndexOf(":");

    if (separatorIndex > 0 && separatorIndex + 1 < payloadId.length) {
      payload.id = `${payloadId.slice(0, separatorIndex + 1)}${persistedSeq}`;
    }
  }

  const serialized: Prisma.InputJsonValue = JSON.parse(JSON.stringify(payload));
  return serialized;
}

function toEventMetadata(
  events: readonly GameEvent[],
  firstPersistedSeq: number
): Array<{ seq: number; eventType: string }> {
  return events.map((event, index) => ({
    seq: firstPersistedSeq + index,
    eventType: event.type
  }));
}

function toPersistedPendingChoice(pendingChoice: PendingChoice | null): unknown | null {
  if (pendingChoice === null) {
    return null;
  }

  return JSON.parse(JSON.stringify(pendingChoice));
}

function toInvalidCommandResult(error: unknown): ApplyGameplayCommandResult {
  if (error instanceof Error) {
    return {
      status: "invalid_command",
      message: error.message
    };
  }

  return {
    status: "invalid_command",
    message: "invalid gameplay command"
  };
}

function toEngineCommand(command: unknown): Command {
  const parsed = gameplayCommandSchema.parse(command);

  const normalizeMode = (mode: { id: string; label?: string | undefined }) => {
    if (mode.label === undefined) {
      return {
        id: mode.id
      };
    }

    return {
      id: mode.id,
      label: mode.label
    };
  };

  const normalizeChoicePayload = () => {
    if (parsed.type !== "MAKE_CHOICE") {
      return null;
    }

    const payload = parsed.payload;

    switch (payload.type) {
      case "CHOOSE_MODE":
        return {
          type: "CHOOSE_MODE" as const,
          mode: normalizeMode(payload.mode)
        };
      default:
        return payload;
    }
  };

  switch (parsed.type) {
    case "CAST_SPELL":
      if (parsed.targets === undefined && parsed.modePick === undefined) {
        return {
          type: "CAST_SPELL",
          cardId: parsed.cardId
        };
      }

      if (parsed.targets === undefined) {
        const modePick = parsed.modePick;

        if (modePick === undefined) {
          throw new Error("invalid CAST_SPELL modePick");
        }

        return {
          type: "CAST_SPELL",
          cardId: parsed.cardId,
          modePick: normalizeMode(modePick)
        };
      }

      if (parsed.modePick === undefined) {
        return {
          type: "CAST_SPELL",
          cardId: parsed.cardId,
          targets: parsed.targets
        };
      }

      return {
        type: "CAST_SPELL",
        cardId: parsed.cardId,
        targets: parsed.targets,
        modePick: normalizeMode(parsed.modePick)
      };
    case "ACTIVATE_ABILITY":
      if (parsed.targets === undefined) {
        return {
          type: "ACTIVATE_ABILITY",
          sourceId: parsed.sourceId,
          abilityIndex: parsed.abilityIndex
        };
      }

      return {
        type: "ACTIVATE_ABILITY",
        sourceId: parsed.sourceId,
        abilityIndex: parsed.abilityIndex,
        targets: parsed.targets
      };
    case "MAKE_CHOICE": {
      const payload = normalizeChoicePayload();

      if (payload === null) {
        throw new Error("invalid MAKE_CHOICE payload");
      }

      return {
        type: "MAKE_CHOICE",
        payload
      };
    }
    case "PASS_PRIORITY":
      return { type: "PASS_PRIORITY" };
    case "DECLARE_ATTACKERS":
      return {
        type: "DECLARE_ATTACKERS",
        attackers: parsed.attackers
      };
    case "DECLARE_BLOCKERS":
      return {
        type: "DECLARE_BLOCKERS",
        assignments: parsed.assignments
      };
    case "PLAY_LAND":
      return {
        type: "PLAY_LAND",
        cardId: parsed.cardId
      };
    case "CONCEDE":
      return { type: "CONCEDE" };
    default:
      throw new Error("unsupported command type");
  }
}

function applyCommandToState(state: GameState, command: unknown) {
  const parsedCommand = toEngineCommand(command);
  return processCommand(state, parsedCommand, new Rng(state.rngSeed));
}

export async function applyGameplayCommandInDatabase(
  roomId: string,
  userId: string,
  command: unknown
): Promise<ApplyGameplayCommandResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      id: true,
      participants: {
        select: {
          userId: true
        }
      },
      game: {
        select: {
          id: true
        }
      }
    }
  });

  if (!room || !room.game) {
    return {
      status: "not_found"
    };
  }

  const roomGame = room.game;

  const isParticipant = room.participants.some((participant) => participant.userId === userId);

  if (!isParticipant) {
    return {
      status: "forbidden"
    };
  }

  try {
    const result = await prisma.$transaction(async (tx): Promise<ApplyGameplayCommandResult> => {
      const game = await tx.game.findUnique({
        where: {
          id: roomGame.id
        },
        select: {
          id: true,
          state: true,
          stateVersion: true,
          lastAppliedEventSeq: true
        }
      });

      if (!game) {
        return {
          status: "not_found"
        };
      }

      const currentState = fromPersistedGameState(game.state);
      const applied = applyCommandToState(currentState, command);
      const nextState = applied.nextState;
      const emittedEvents = applied.newEvents;
      const firstPersistedEventSeq = game.lastAppliedEventSeq + 1;
      const nextStateVersion = game.stateVersion + 1;
      const nextLastAppliedEventSeq = game.lastAppliedEventSeq + emittedEvents.length;
      const persistedState = toPersistedGameState(nextState);

      const updated = await tx.game.updateMany({
        where: {
          id: game.id,
          stateVersion: game.stateVersion,
          lastAppliedEventSeq: game.lastAppliedEventSeq
        },
        data: {
          state: persistedState,
          stateVersion: nextStateVersion,
          lastAppliedEventSeq: nextLastAppliedEventSeq
        }
      });

      if (updated.count !== 1) {
        return {
          status: "conflict"
        };
      }

      if (emittedEvents.length > 0) {
        await tx.gameEvent.createMany({
          data: emittedEvents.map((event, index) => {
            const persistedSeq = firstPersistedEventSeq + index;

            return {
              gameId: game.id,
              seq: persistedSeq,
              eventType: event.type,
              payload: toPersistedEventPayload(event, persistedSeq),
              schemaVersion: event.schemaVersion,
              causedByUserId: userId
            };
          })
        });
      }

      return {
        status: "applied",
        roomId: room.id,
        gameId: game.id,
        stateVersion: nextStateVersion,
        lastAppliedEventSeq: nextLastAppliedEventSeq,
        pendingChoice: toPersistedPendingChoice(applied.pendingChoice),
        emittedEvents: toEventMetadata(emittedEvents, firstPersistedEventSeq)
      };
    });

    return result;
  } catch (error) {
    return toInvalidCommandResult(error);
  }
}
