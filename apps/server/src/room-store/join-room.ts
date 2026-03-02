import { prisma } from "@forgetful-fish/database";

import type { JoinRoomResult, RoomSeat } from "./types";
import { isUniqueConstraintError, normalizeRoomSeat } from "./utils";

export async function joinRoomInDatabase(roomId: string, userId: string): Promise<JoinRoomResult> {
  const room = await prisma.room.findUnique({
    where: {
      id: roomId
    },
    select: {
      id: true
    }
  });

  if (!room) {
    return {
      status: "not_found"
    };
  }

  const existing = await prisma.roomParticipant.findUnique({
    where: {
      roomId_userId: {
        roomId,
        userId
      }
    },
    select: {
      seat: true
    }
  });

  if (existing) {
    return {
      status: "joined",
      roomId,
      userId,
      seat: normalizeRoomSeat(existing.seat)
    };
  }

  const occupiedSeats: Array<{ seat: RoomSeat }> = await prisma.roomParticipant.findMany({
    where: {
      roomId
    },
    select: {
      seat: true
    }
  });

  if (occupiedSeats.length >= 2) {
    return {
      status: "full"
    };
  }

  const seat: RoomSeat = occupiedSeats.some((participant) => participant.seat === "P1")
    ? "P2"
    : "P1";

  try {
    await prisma.roomParticipant.create({
      data: {
        roomId,
        userId,
        seat
      }
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingAfterConflict = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId
        }
      },
      select: {
        seat: true
      }
    });

    if (existingAfterConflict) {
      return {
        status: "joined",
        roomId,
        userId,
        seat: normalizeRoomSeat(existingAfterConflict.seat)
      };
    }

    return {
      status: "full"
    };
  }

  return {
    status: "joined",
    roomId,
    userId,
    seat
  };
}
