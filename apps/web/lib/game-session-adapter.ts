import type {
  GameplayCommand,
  GameplayCommandResponse,
  RoomGameStarted,
  RoomLobbySnapshot
} from "@forgetful-fish/realtime-contract";

import { createRoomRealtimeClient, type RoomRealtimeStatus } from "./room-realtime";
import {
  ServerApiError,
  getRoomLobby,
  joinRoom,
  setRoomReady,
  startRoomGame,
  submitGameplayCommand
} from "./server-api";

export function toSessionStatusMessage(error: unknown) {
  if (!(error instanceof ServerApiError)) {
    return null;
  }

  if (error.status === 401) {
    return "Session expired. Please verify your sign-in again.";
  }

  if (error.status === 403) {
    return "You are no longer authorized for this room.";
  }

  return null;
}

type GameSessionAdapterApi = {
  joinRoom: typeof joinRoom;
  getRoomLobby: typeof getRoomLobby;
  setRoomReady: typeof setRoomReady;
  startRoomGame: typeof startRoomGame;
  submitGameplayCommand: typeof submitGameplayCommand;
};

export type GameSessionViewModel = {
  roomId: string;
  participants: RoomLobbySnapshot["participants"];
  gameId: string | null;
  gameStatus: "not_started" | "started";
  latestAppliedVersion: { stateVersion: number; lastAppliedEventSeq: number } | null;
  pendingChoice: GameplayCommandResponse["pendingChoice"];
  lastEventType: string | null;
};

type GameSessionAdapterOptions = {
  roomId: string;
  serverBaseUrl?: string;
  webSocketFactory?: (url: string) => WebSocket;
  onStatusChange: (status: RoomRealtimeStatus) => void;
  onLobbySnapshot: (snapshot: RoomLobbySnapshot) => void;
  onLobbyUpdated: (snapshot: RoomLobbySnapshot) => void;
  onGameStarted: (payload: RoomGameStarted) => void;
  onGameUpdated?: (payload: GameplayCommandResponse) => void;
  onViewModelChange?: (viewModel: GameSessionViewModel) => void;
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
  onGameUpdated = () => {},
  onViewModelChange = () => {},
  api = defaultApi,
  createRealtimeClient = createRoomRealtimeClient
}: GameSessionAdapterOptions) {
  let realtimeClient: ReturnType<typeof createRoomRealtimeClient> | null = null;
  let latestAppliedVersion: { stateVersion: number; lastAppliedEventSeq: number } | null = null;
  let viewModel: GameSessionViewModel = {
    roomId,
    participants: [],
    gameId: null,
    gameStatus: "not_started",
    latestAppliedVersion: null,
    pendingChoice: null,
    lastEventType: null
  };

  function updateViewModel(next: Partial<GameSessionViewModel>) {
    viewModel = {
      ...viewModel,
      ...next,
      latestAppliedVersion
    };
    onViewModelChange(viewModel);
  }

  function applyGameplayUpdate(payload: GameplayCommandResponse) {
    const latestEvent = payload.emittedEvents[payload.emittedEvents.length - 1];
    updateViewModel({
      gameId: payload.gameId,
      gameStatus: "started",
      pendingChoice: payload.pendingChoice,
      lastEventType: latestEvent?.eventType ?? null
    });
  }

  function getRealtimeClient() {
    if (realtimeClient) {
      return realtimeClient;
    }

    realtimeClient = createRealtimeClient({
      roomId,
      serverBaseUrl,
      webSocketFactory,
      onStatusChange,
      onLobbySnapshot: (snapshot) => {
        latestAppliedVersion = null;
        updateViewModel({
          participants: snapshot.participants,
          gameId: snapshot.gameId,
          gameStatus: snapshot.gameStatus,
          pendingChoice: null,
          lastEventType: null
        });
        onLobbySnapshot(snapshot);
      },
      onLobbyUpdated: (snapshot) => {
        updateViewModel({
          participants: snapshot.participants,
          gameId: snapshot.gameId,
          gameStatus: snapshot.gameStatus
        });
        onLobbyUpdated(snapshot);
      },
      onGameStarted: (payload) => {
        updateViewModel({
          gameId: payload.gameId,
          gameStatus: payload.gameStatus
        });
        onGameStarted(payload);
      },
      onGameUpdated: (payload) => {
        const applied = trackAppliedVersion(payload);

        if (!applied) {
          return;
        }

        applyGameplayUpdate(payload);
        onGameUpdated(payload);
      }
    });

    return realtimeClient;
  }

  function trackAppliedVersion(response: GameplayCommandResponse) {
    const incomingVersion = {
      stateVersion: response.stateVersion,
      lastAppliedEventSeq: response.lastAppliedEventSeq
    };

    if (!latestAppliedVersion) {
      latestAppliedVersion = incomingVersion;
      return true;
    }

    const current = latestAppliedVersion;
    const isNewerStateVersion = incomingVersion.stateVersion > current.stateVersion;
    const isSameStateVersion = incomingVersion.stateVersion === current.stateVersion;
    const isNewerOrEqualEventSeq =
      isSameStateVersion && incomingVersion.lastAppliedEventSeq >= current.lastAppliedEventSeq;

    if (isNewerStateVersion || isNewerOrEqualEventSeq) {
      latestAppliedVersion = incomingVersion;
      return true;
    }

    return false;
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
      if (trackAppliedVersion(response)) {
        applyGameplayUpdate(response);
      }
      return response;
    },
    getLatestAppliedVersion() {
      return latestAppliedVersion;
    },
    getViewModel() {
      return viewModel;
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
