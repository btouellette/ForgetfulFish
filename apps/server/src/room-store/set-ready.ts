import { prisma } from "@forgetful-fish/database";

import type { SetRoomReadyResult } from "./types";
import { normalizeRoomSeat } from "./utils";

export async function setRoomReadyInDatabase(
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
