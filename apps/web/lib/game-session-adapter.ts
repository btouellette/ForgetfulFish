import type {
  GameplayCommand,
  GameplayCommandResponse,
  RoomGameStarted,
  RoomLobbySnapshot
} from "@forgetful-fish/realtime-contract";

import { createRoomRealtimeClient, type RoomRealtimeStatus } from "./room-realtime";
import {
  getRoomLobby,
  joinRoom,
  setRoomReady,
  startRoomGame,
  submitGameplayCommand
} from "./server-api";

type GameSessionAdapterApi = {
  joinRoom: typeof joinRoom;
  getRoomLobby: typeof getRoomLobby;
  setRoomReady: typeof setRoomReady;
  startRoomGame: typeof startRoomGame;
  submitGameplayCommand: typeof submitGameplayCommand;
};

type GameSessionAdapterOptions = {
  roomId: string;
  serverBaseUrl?: string;
  webSocketFactory?: (url: string) => WebSocket;
  onStatusChange: (status: RoomRealtimeStatus) => void;
  onLobbySnapshot: (snapshot: RoomLobbySnapshot) => void;
  onLobbyUpdated: (snapshot: RoomLobbySnapshot) => void;
  onGameStarted: (payload: RoomGameStarted) => void;
  api?: GameSessionAdapterApi;
  createRealtimeClient?: typeof createRoomRealtimeClient;
};

const defaultApi: GameSessionAdapterApi = {
  joinRoom,
  getRoomLobby,
  setRoomReady,
  startRoomGame,
  submitGameplayCommand
};

export function createGameSessionAdapter({
  roomId,
  serverBaseUrl = "",
  webSocketFactory,
  onStatusChange,
  onLobbySnapshot,
  onLobbyUpdated,
  onGameStarted,
  api = defaultApi,
  createRealtimeClient = createRoomRealtimeClient
}: GameSessionAdapterOptions) {
  let realtimeClient: ReturnType<typeof createRoomRealtimeClient> | null = null;
  let latestAppliedVersion: { stateVersion: number; lastAppliedEventSeq: number } | null = null;

  function getRealtimeClient() {
    if (realtimeClient) {
      return realtimeClient;
    }

    realtimeClient = createRealtimeClient({
      roomId,
      serverBaseUrl,
      webSocketFactory,
      onStatusChange,
      onLobbySnapshot,
      onLobbyUpdated,
      onGameStarted
    });

    return realtimeClient;
  }

  function trackAppliedVersion(response: GameplayCommandResponse) {
    latestAppliedVersion = {
      stateVersion: response.stateVersion,
      lastAppliedEventSeq: response.lastAppliedEventSeq
    };
  }

  return {
    joinRoom() {
      return api.joinRoom(roomId);
    },
    getRoomLobby() {
      return api.getRoomLobby(roomId);
    },
    setRoomReady(ready: boolean) {
      return api.setRoomReady(roomId, ready);
    },
    startRoomGame() {
      return api.startRoomGame(roomId);
    },
    async submitGameplayCommand(command: GameplayCommand) {
      const response = await api.submitGameplayCommand(roomId, command);
      trackAppliedVersion(response);
      return response;
    },
    getLatestAppliedVersion() {
      return latestAppliedVersion;
    },
    connect() {
      getRealtimeClient().connect();
    },
    disconnect() {
      if (!realtimeClient) {
        return;
      }

      realtimeClient.disconnect();
      realtimeClient = null;
    }
  };
}
