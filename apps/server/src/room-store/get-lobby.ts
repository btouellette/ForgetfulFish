import { prisma } from "@forgetful-fish/database";

import type { GetRoomLobbyResult } from "./types";
import { normalizeRoomSeat, sortParticipantsBySeat } from "./utils";

export async function getRoomLobbyInDatabase(
  roomId: string,
  userId: string
): Promise<GetRoomLobbyResult> {
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
