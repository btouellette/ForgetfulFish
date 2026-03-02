import { buildServer } from "../src/app";

type RoomSeat = "P1" | "P2";

function createInMemoryRoomStore() {
  type Participant = {
    userId: string;
    ready: boolean;
  };

  type RoomState = {
    participants: Map<RoomSeat, Participant>;
    gameId: string | null;
  };

  const rooms = new Map<string, RoomState>();
  let nextRoomIndex = 1;
  let nextGameIndex = 1;

  return {
    async createRoom(ownerUserId: string) {
      const roomId = `00000000-0000-4000-8000-${String(nextRoomIndex).padStart(12, "0")}`;
      nextRoomIndex += 1;

      rooms.set(roomId, {
        participants: new Map([["P1", { userId: ownerUserId, ready: false }]]),
        gameId: null
      });

      return {
        roomId,
        ownerUserId,
        seat: "P1" as const
      };
    },
    async joinRoom(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return { status: "not_found" as const };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId === userId) {
          return { status: "joined" as const, roomId, userId, seat };
        }
      }

      if (room.participants.size >= 2) {
        return { status: "full" as const };
      }

      const seat: RoomSeat = room.participants.has("P1") ? "P2" : "P1";
      room.participants.set(seat, { userId, ready: false });

      return { status: "joined" as const, roomId, userId, seat };
    },
    async getLobby(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return { status: "not_found" as const };
      }

      const isParticipant = [...room.participants.values()].some(
        (participant) => participant.userId === userId
      );

      if (!isParticipant) {
        return { status: "forbidden" as const };
      }

      const participants = [...room.participants.entries()].map(([seat, participant]) => ({
        userId: participant.userId,
        seat,
        ready: participant.ready
      }));

      return {
        status: "ok" as const,
        payload: {
          roomId,
          participants,
          gameId: room.gameId,
          gameStatus: room.gameId ? ("started" as const) : ("not_started" as const)
        }
      };
    },
    async setReady(roomId: string, userId: string, ready: boolean) {
      const room = rooms.get(roomId);

      if (!room) {
        return { status: "not_found" as const };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId !== userId) {
          continue;
        }

        if (!room.gameId) {
          room.participants.set(seat, { ...participant, ready });
        }

        return {
          status: "ok" as const,
          roomId,
          userId,
          seat,
          ready: room.gameId ? participant.ready : ready
        };
      }

      return { status: "forbidden" as const };
    },
    async startGame(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return { status: "not_found" as const };
      }

      const participants = [...room.participants.values()];
      const isParticipant = participants.some((participant) => participant.userId === userId);

      if (!isParticipant) {
        return { status: "forbidden" as const };
      }

      if (room.gameId) {
        return {
          status: "started" as const,
          roomId,
          gameId: room.gameId,
          gameStatus: "started" as const
        };
      }

      if (participants.length < 2 || participants.some((participant) => !participant.ready)) {
        return { status: "not_ready" as const };
      }

      room.gameId = `10000000-0000-4000-8000-${String(nextGameIndex).padStart(12, "0")}`;
      nextGameIndex += 1;

      return {
        status: "started" as const,
        roomId,
        gameId: room.gameId,
        gameStatus: "started" as const
      };
    }
  };
}

function createSessionLookup(userIdByToken: Record<string, string>) {
  return async (sessionToken: string) => {
    const userId = userIdByToken[sessionToken];

    if (!userId) {
      return null;
    }

    return {
      expires: new Date("2100-01-01T00:00:00.000Z"),
      user: {
        id: userId,
        email: `${userId}@example.com`
      }
    };
  };
}

async function main() {
  const app = buildServer({
    sessionLookup: createSessionLookup({
      "owner-token": "owner-1",
      "second-token": "player-2"
    }),
    roomStore: createInMemoryRoomStore()
  });

  const port = Number(process.env.PORT ?? 4100);
  const host = process.env.HOST ?? "127.0.0.1";

  await app.listen({ port, host });

  const shutdown = () => {
    void app.close().finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
