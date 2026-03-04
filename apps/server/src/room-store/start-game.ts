import { randomUUID } from "node:crypto";

import { prisma } from "@forgetful-fish/database";
import { createInitialGameState } from "@forgetful-fish/game-engine";

import { toPersistedGameState } from "./state-persistence";
import type { StartGameResult } from "./types";
import { compareSeats, isUniqueConstraintError, normalizeRoomSeat } from "./utils";

export async function startGameInDatabase(
  roomId: string,
  userId: string
): Promise<StartGameResult> {
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

  const gameId = randomUUID();
  const initialState = createInitialGameState(firstParticipant.userId, secondParticipant.userId, {
    id: gameId,
    rngSeed: randomUUID()
  });
  const serializedInitialState = toPersistedGameState(initialState);
  const stateVersion = 1;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.game.create({
        data: {
          id: gameId,
          roomId,
          startedByUserId: userId,
          state: serializedInitialState,
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
            state: serializedInitialState,
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
