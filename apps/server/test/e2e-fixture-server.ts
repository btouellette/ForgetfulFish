import {
  createInitialGameStateFromDecks,
  processCommand,
  projectPlayerView,
  Rng,
  type GameEvent,
  type PendingChoice
} from "@forgetful-fish/game-engine";
import { gameplayCommandSchema } from "@forgetful-fish/realtime-contract";
import type { GameplayCommand } from "@forgetful-fish/realtime-contract";

import { buildServer } from "../src/app";
import { createGameplayDeckPreset } from "../src/room-store/deck-preset";

type RoomSeat = "P1" | "P2";

function createInMemoryRoomStore() {
  type Participant = {
    userId: string;
    ready: boolean;
  };

  type RoomState = {
    participants: Map<RoomSeat, Participant>;
    gameId: string | null;
    gameState: ReturnType<typeof createInitialGameStateFromDecks> | null;
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

  const toPersistedEventPayload = (event: GameEvent, persistedSeq: number): unknown => {
    const payload = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    payload.seq = persistedSeq;

    const payloadId = payload.id;

    if (typeof payloadId === "string") {
      const separatorIndex = payloadId.lastIndexOf(":");

      if (separatorIndex > 0 && separatorIndex + 1 < payloadId.length) {
        payload.id = `${payloadId.slice(0, separatorIndex + 1)}${persistedSeq}`;
      }
    }

    return payload;
  };

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
    async getGameState(roomId: string, userId: string) {
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

      if (room.gameState === null) {
        return { status: "not_found" as const };
      }

      const projected = projectPlayerView(room.gameState, userId);

      return {
        status: "ok" as const,
        payload: {
          ...projected,
          stateVersion: room.stateVersion ?? projected.stateVersion
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
      const participantEntries = [...room.participants.entries()].sort(([left], [right]) => {
        if (left === right) {
          return 0;
        }

        return left === "P1" ? -1 : 1;
      });
      const firstParticipant = participantEntries[0];
      const secondParticipant = participantEntries[1];

      if (!firstParticipant || !secondParticipant || !room.gameId) {
        return { status: "not_ready" as const };
      }

      room.gameState = createInitialGameStateFromDecks(
        firstParticipant[1].userId,
        secondParticipant[1].userId,
        {
          id: room.gameId,
          rngSeed: `seed-${room.gameId}`,
          decks: {
            playerOne: createGameplayDeckPreset(),
            playerTwo: createGameplayDeckPreset()
          },
          openingDrawCount: 0
        }
      );
      room.stateVersion = 1;
      room.lastAppliedEventSeq = 0;
      room.gameEvents = [
        {
          seq: 0,
          eventType: "game_initialized",
          schemaVersion: room.stateVersion,
          causedByUserId: userId,
          payload: {
            stateVersion: room.stateVersion,
            state: room.gameState,
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
        gameId: room.gameId,
        gameStatus: "started" as const
      };
    },
    async applyCommand(roomId: string, userId: string, command: unknown) {
      const room = rooms.get(roomId);

      if (!room || room.gameId === null || room.gameState === null) {
        return { status: "not_found" as const };
      }

      const isParticipant = [...room.participants.values()].some(
        (participant) => participant.userId === userId
      );

      if (!isParticipant) {
        return { status: "forbidden" as const };
      }

      let result:
        | {
            nextState: ReturnType<typeof createInitialGameStateFromDecks>;
            newEvents: GameEvent[];
            pendingChoice: PendingChoice | null;
          }
        | undefined;

      const actor = room.gameState.players.find((player) => player.id === userId);

      if (actor === undefined) {
        return { status: "forbidden" as const };
      }

      try {
        const parsedCommand = gameplayCommandSchema.parse(command);

        const canActorSubmitCommand = (
          state: ReturnType<typeof createInitialGameStateFromDecks>,
          nextCommand: GameplayCommand
        ) => {
          const priorityHolder = state.turnState.priorityState.playerWithPriority;
          const activePlayerId = state.turnState.activePlayerId;
          const currentStep = state.turnState.step;

          switch (nextCommand.type) {
            case "PASS_PRIORITY":
            case "PLAY_LAND":
            case "CAST_SPELL":
            case "ACTIVATE_ABILITY":
              return priorityHolder === actor.id;
            case "DECLARE_ATTACKERS":
              return (
                priorityHolder === actor.id &&
                currentStep === "DECLARE_ATTACKERS" &&
                actor.id === activePlayerId
              );
            case "DECLARE_BLOCKERS":
              return (
                priorityHolder === actor.id &&
                currentStep === "DECLARE_BLOCKERS" &&
                actor.id !== activePlayerId
              );
            case "MAKE_CHOICE":
              return state.pendingChoice !== null && state.pendingChoice.forPlayer === actor.id;
            case "CONCEDE":
              return true;
            default:
              return false;
          }
        };

        if (!canActorSubmitCommand(room.gameState, parsedCommand)) {
          return { status: "forbidden" as const };
        }

        const engineCommand =
          parsedCommand.type === "CONCEDE"
            ? { ...parsedCommand, playerId: actor.id }
            : parsedCommand;

        result = processCommand(room.gameState, engineCommand, new Rng(room.gameState.rngSeed));
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
          payload: toPersistedEventPayload(event, priorSeq + index + 1)
        }))
      );

      return {
        status: "applied" as const,
        roomId,
        gameId: room.gameId,
        stateVersion: room.stateVersion,
        lastAppliedEventSeq: room.lastAppliedEventSeq,
        pendingChoice: result.pendingChoice,
        emittedEvents: result.newEvents.map((event, index) => ({
          seq: priorSeq + index + 1,
          eventType: event.type
        }))
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
