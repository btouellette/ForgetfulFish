import { randomUUID } from "node:crypto";

import { prisma } from "@forgetful-fish/database";

import type { CreatedRoomPayload } from "./types";

export async function createRoomInDatabase(ownerUserId: string): Promise<CreatedRoomPayload> {
  const roomId = randomUUID();

  await prisma.room.create({
    data: {
      id: roomId,
      participants: {
        create: {
          userId: ownerUserId,
          seat: "P1"
        }
      }
    }
  });

  return {
    roomId,
    ownerUserId,
    seat: "P1"
  };
}
