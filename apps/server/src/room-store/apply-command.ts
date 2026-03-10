import { prisma } from "@forgetful-fish/database";
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

function toEventMetadata(events: readonly GameEvent[]): Array<{ seq: number; eventType: string }> {
  return events.map((event) => ({
    seq: event.seq,
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
          id: true,
          state: true,
          stateVersion: true,
          lastAppliedEventSeq: true
        }
      }
    }
  });

  if (!room || !room.game) {
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

  let applied:
    | {
        nextState: GameState;
        newEvents: GameEvent[];
        pendingChoice: PendingChoice | null;
      }
    | undefined;

  try {
    const currentState = fromPersistedGameState(room.game.state);
    applied = applyCommandToState(currentState, command);
  } catch (error) {
    return toInvalidCommandResult(error);
  }

  const nextState = applied.nextState;
  const emittedEvents = applied.newEvents;
  const nextStateVersion = room.game.stateVersion + 1;
  const nextLastAppliedEventSeq = room.game.lastAppliedEventSeq + emittedEvents.length;
  const persistedState = toPersistedGameState(nextState);

  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: {
        id: room.game!.id
      },
      data: {
        state: persistedState,
        stateVersion: nextStateVersion,
        lastAppliedEventSeq: nextLastAppliedEventSeq
      }
    });

    if (emittedEvents.length > 0) {
      await tx.gameEvent.createMany({
        data: emittedEvents.map((event, index) => ({
          gameId: room.game!.id,
          seq: room.game!.lastAppliedEventSeq + index + 1,
          eventType: event.type,
          payload: JSON.parse(JSON.stringify(event)),
          schemaVersion: event.schemaVersion,
          causedByUserId: userId
        }))
      });
    }
  });

  return {
    status: "applied",
    roomId: room.id,
    gameId: room.game.id,
    stateVersion: nextStateVersion,
    lastAppliedEventSeq: nextLastAppliedEventSeq,
    pendingChoice: toPersistedPendingChoice(applied.pendingChoice),
    emittedEvents: toEventMetadata(emittedEvents)
  };
}
