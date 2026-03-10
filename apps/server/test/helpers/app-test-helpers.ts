import {
  createInitialGameStateFromDecks,
  processCommand,
  Rng,
  type GameEvent,
  type GameState,
  type PendingChoice
} from "@forgetful-fish/game-engine";
import { gameplayCommandSchema } from "@forgetful-fish/realtime-contract";

import { buildServer } from "../../src/app";
import { createGameplayDeckPreset } from "../../src/room-store/deck-preset";

export function createInMemoryRoomStore() {
  type RoomState = {
    participants: Map<"P1" | "P2", { userId: string; ready: boolean }>;
    gameId: string | null;
    gameState: GameState | null;
    stateVersion: number | null;
    lastAppliedEventSeq: number | null;
    gameEvents: Array<{
      seq: number;
      eventType: string;
      schemaVersion: number;
      causedByUserId: string;
      payload: unknown;
    }>;
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
        gameId: null,
        gameState: null,
        stateVersion: null,
        lastAppliedEventSeq: null,
        gameEvents: []
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
        return {
          status: "not_found" as const
        };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId === userId) {
          return {
            status: "joined" as const,
            roomId,
            userId,
            seat
          };
        }
      }

      if (room.participants.size >= 2) {
        return {
          status: "full" as const
        };
      }

      const seat: "P1" | "P2" = room.participants.has("P1") ? "P2" : "P1";
      room.participants.set(seat, { userId, ready: false });

      return {
        status: "joined" as const,
        roomId,
        userId,
        seat
      };
    },
    async getLobby(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return {
          status: "not_found" as const
        };
      }

      const isParticipant = [...room.participants.values()].some(
        (participant) => participant.userId === userId
      );

      if (!isParticipant) {
        return {
          status: "forbidden" as const
        };
      }

      const participants = [...room.participants.entries()].map(([seat, participant]) => ({
        seat,
        userId: participant.userId,
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
        return {
          status: "not_found" as const
        };
      }

      if (room.gameId) {
        for (const [seat, participant] of room.participants.entries()) {
          if (participant.userId !== userId) {
            continue;
          }

          return {
            status: "ok" as const,
            roomId,
            userId,
            seat,
            ready: participant.ready
          };
        }

        return {
          status: "forbidden" as const
        };
      }

      for (const [seat, participant] of room.participants.entries()) {
        if (participant.userId !== userId) {
          continue;
        }

        room.participants.set(seat, {
          ...participant,
          ready
        });

        return {
          status: "ok" as const,
          roomId,
          userId,
          seat,
          ready
        };
      }

      return {
        status: "forbidden" as const
      };
    },
    async startGame(roomId: string, userId: string) {
      const room = rooms.get(roomId);

      if (!room) {
        return {
          status: "not_found" as const
        };
      }

      const participants = [...room.participants.values()];
      const isParticipant = participants.some((participant) => participant.userId === userId);

      if (!isParticipant) {
        return {
          status: "forbidden" as const
        };
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
        return {
          status: "not_ready" as const
        };
      }

      const gameId = `10000000-0000-4000-8000-${String(nextGameIndex).padStart(12, "0")}`;
      nextGameIndex += 1;
      room.gameId = gameId;
      const participantEntries = [...room.participants.entries()].sort(([left], [right]) => {
        if (left === right) {
          return 0;
        }

        return left === "P1" ? -1 : 1;
      });
      const firstParticipant = participantEntries[0];
      const secondParticipant = participantEntries[1];

      if (!firstParticipant || !secondParticipant) {
        return {
          status: "not_ready" as const
        };
      }

      const stateVersion = 1;
      const gameState = createInitialGameStateFromDecks(
        firstParticipant[1].userId,
        secondParticipant[1].userId,
        {
          id: gameId,
          rngSeed: `seed-${gameId}`,
          decks: {
            playerOne: createGameplayDeckPreset(),
            playerTwo: createGameplayDeckPreset()
          },
          openingDrawCount: 0
        }
      );
      room.gameState = gameState;
      room.stateVersion = stateVersion;
      room.lastAppliedEventSeq = 0;
      room.gameEvents = [
        {
          seq: 0,
          eventType: "game_initialized",
          schemaVersion: stateVersion,
          causedByUserId: userId,
          payload: {
            stateVersion,
            state: gameState,
            playersBySeat: participantEntries.map(([seat, participant]) => ({
              seat,
              userId: participant.userId
            }))
          }
        }
      ];

      return {
        status: "started" as const,
        roomId,
        gameId,
        gameStatus: "started" as const
      };
    },
    async applyCommand(roomId: string, userId: string, command: unknown) {
      const room = rooms.get(roomId);

      if (!room || room.gameId === null || room.gameState === null) {
        return {
          status: "not_found" as const
        };
      }

      const isParticipant = [...room.participants.values()].some(
        (participant) => participant.userId === userId
      );

      if (!isParticipant) {
        return {
          status: "forbidden" as const
        };
      }

      let result:
        | {
            nextState: GameState;
            newEvents: GameEvent[];
            pendingChoice: PendingChoice | null;
          }
        | undefined;

      try {
        const parsedCommand = gameplayCommandSchema.parse(command);
        result = processCommand(room.gameState, parsedCommand, new Rng(room.gameState.rngSeed));
      } catch (error) {
        if (error instanceof Error) {
          return {
            status: "invalid_command" as const,
            message: error.message
          };
        }

        return {
          status: "invalid_command" as const,
          message: "invalid gameplay command"
        };
      }

      room.gameState = result.nextState;
      room.stateVersion = (room.stateVersion ?? 0) + 1;

      const priorSeq = room.lastAppliedEventSeq ?? 0;
      room.lastAppliedEventSeq = priorSeq + result.newEvents.length;

      room.gameEvents.push(
        ...result.newEvents.map((event, index) => ({
          seq: priorSeq + index + 1,
          eventType: event.type,
          schemaVersion: event.schemaVersion,
          causedByUserId: userId,
          payload: event
        }))
      );

      return {
        status: "applied" as const,
        roomId,
        gameId: room.gameId,
        stateVersion: room.stateVersion,
        lastAppliedEventSeq: room.lastAppliedEventSeq,
        pendingChoice: result.pendingChoice,
        emittedEvents: result.newEvents.map((event) => ({
          seq: event.seq,
          eventType: event.type
        }))
      };
    },
    inspectRoom(roomId: string) {
      return rooms.get(roomId);
    }
  };
}

export function buildAuthedSessionLookup(userId: string) {
  return async () => ({
    expires: new Date("2100-01-01T00:00:00.000Z"),
    user: {
      id: userId,
      email: `${userId}@example.com`
    }
  });
}

export function createSessionLookup(userIdByToken: Record<string, string>) {
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

export type InMemoryRoomStore = ReturnType<typeof createInMemoryRoomStore>;

export async function injectAs(
  roomStore: InMemoryRoomStore,
  userId: string,
  request: {
    method: "GET" | "POST";
    url: string;
    payload?: unknown;
  }
): Promise<any> {
  const app = buildServer({
    sessionLookup: buildAuthedSessionLookup(userId),
    roomStore
  });

  try {
    return await app.inject({
      method: request.method,
      url: request.url,
      headers: {
        cookie: "authjs.session-token=valid"
      },
      payload: request.payload as any
    });
  } finally {
    await app.close();
  }
}

export async function createRoomAs(roomStore: InMemoryRoomStore, userId: string) {
  const response = await injectAs(roomStore, userId, {
    method: "POST",
    url: "/api/rooms"
  });

  return response.json().roomId as string;
}

export async function bootstrapRoom(roomStore: InMemoryRoomStore) {
  const roomId = await createRoomAs(roomStore, "owner-1");
  await injectAs(roomStore, "player-2", {
    method: "POST",
    url: `/api/rooms/${roomId}/join`
  });
  return roomId;
}
