import { prisma } from "@forgetful-fish/database";
import { projectPlayerView } from "@forgetful-fish/game-engine";

import { fromPersistedGameState } from "./state-persistence";
import type { GetRoomGameStateResult } from "./types";

export async function getRoomGameStateInDatabase(
  roomId: string,
  userId: string
): Promise<GetRoomGameStateResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      participants: {
        select: {
          userId: true
        }
      },
      game: {
        select: {
          state: true
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

  if (!room.game) {
    return {
      status: "not_found"
    };
  }

  return {
    status: "ok",
    payload: projectPlayerView(fromPersistedGameState(room.game.state), userId)
  };
}
