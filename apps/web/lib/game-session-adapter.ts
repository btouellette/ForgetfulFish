import { playerGameViewSchema } from "@forgetful-fish/realtime-contract";
import type {
  GameplayCommand,
  GameplayCommandResponse,
  PlayerGameView,
  RoomGameStarted,
  RoomLobbySnapshot
} from "@forgetful-fish/realtime-contract";

import { createRoomRealtimeClient, type RoomRealtimeStatus } from "./room-realtime";
import {
  ServerApiError,
  getGameState,
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
  getGameState: typeof getGameState;
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

function cloneViewModel(viewModel: GameSessionViewModel): GameSessionViewModel {
  if (typeof structuredClone === "function") {
    return structuredClone(viewModel);
  }

  return JSON.parse(JSON.stringify(viewModel)) as GameSessionViewModel;
}

type GameSessionAdapterOptions = {
  roomId: string;
  serverBaseUrl?: string;
  webSocketFactory?: (url: string) => WebSocket;
  onStatusChange: (status: RoomRealtimeStatus) => void;
  onLobbySnapshot: (snapshot: RoomLobbySnapshot) => void;
  onLobbyUpdated: (snapshot: RoomLobbySnapshot) => void;
  onGameStarted: (payload: RoomGameStarted) => void;
  onGameUpdated?: (payload: GameplayCommandResponse) => void;
  onGameViewChange?: (gameView: PlayerGameView | null) => void;
  onGameStateError?: (error: unknown) => void;
  onViewModelChange?: (viewModel: GameSessionViewModel) => void;
  api?: GameSessionAdapterApi;
  createRealtimeClient?: typeof createRoomRealtimeClient;
};

const defaultApi: GameSessionAdapterApi = {
  joinRoom,
  getRoomLobby,
  getGameState,
  setRoomReady,
  startRoomGame,
  submitGameplayCommand
};

function cloneGameView(gameView: PlayerGameView): PlayerGameView {
  if (typeof structuredClone === "function") {
    return structuredClone(gameView);
  }

  return playerGameViewSchema.parse(JSON.parse(JSON.stringify(gameView)));
}

export function createGameSessionAdapter({
  roomId,
  serverBaseUrl = "",
  webSocketFactory,
  onStatusChange,
  onLobbySnapshot,
  onLobbyUpdated,
  onGameStarted,
  onGameUpdated = () => {},
  onGameViewChange = () => {},
  onGameStateError = () => {},
  onViewModelChange = () => {},
  api = defaultApi,
  createRealtimeClient = createRoomRealtimeClient
}: GameSessionAdapterOptions) {
  let realtimeClient: ReturnType<typeof createRoomRealtimeClient> | null = null;
  let latestAppliedVersion: { stateVersion: number; lastAppliedEventSeq: number } | null = null;
  let gameView: PlayerGameView | null = null;
  let refreshRequestId = 0;
  let refreshInFlight: Promise<void> | null = null;
  let queuedRefresh = false;
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
    onViewModelChange(cloneViewModel(viewModel));
  }

  function setGameView(nextGameView: PlayerGameView | null) {
    gameView = nextGameView === null ? null : cloneGameView(nextGameView);
    onGameViewChange(gameView === null ? null : cloneGameView(gameView));
  }

  function applyLobbyProjection(snapshot: RoomLobbySnapshot) {
    if (snapshot.gameStatus !== "started" || snapshot.gameId === null) {
      latestAppliedVersion = null;
      updateViewModel({
        participants: snapshot.participants,
        gameId: null,
        gameStatus: "not_started",
        pendingChoice: null,
        lastEventType: null
      });
      setGameView(null);
      return;
    }

    updateViewModel({
      participants: snapshot.participants,
      gameId: snapshot.gameId,
      gameStatus: snapshot.gameStatus
    });
  }

  function gameplayUpdateEndedGame(payload: GameplayCommandResponse) {
    return payload.emittedEvents.some((event) => event.eventType === "PLAYER_LOST");
  }

  function applyGameplayUpdate(payload: GameplayCommandResponse) {
    const latestEvent = payload.emittedEvents[payload.emittedEvents.length - 1];

    if (gameplayUpdateEndedGame(payload)) {
      latestAppliedVersion = null;
      updateViewModel({
        gameId: null,
        gameStatus: "not_started",
        pendingChoice: null,
        lastEventType: latestEvent?.eventType ?? null
      });
      setGameView(null);
      return;
    }

    updateViewModel({
      gameId: payload.gameId,
      gameStatus: "started",
      pendingChoice: payload.pendingChoice,
      lastEventType: latestEvent?.eventType ?? null
    });
  }

  async function fetchGameStateInternal() {
    const nextGameView = await api.getGameState(roomId);
    setGameView(nextGameView);
    return nextGameView;
  }

  async function refreshGameStateInternal(expectedGameId: string | null, requestId: number) {
    const nextGameView = await api.getGameState(roomId);

    if (
      requestId !== refreshRequestId ||
      viewModel.gameStatus !== "started" ||
      viewModel.gameId !== expectedGameId
    ) {
      return;
    }

    setGameView(nextGameView);
  }

  function refreshGameState() {
    refreshRequestId += 1;
    const requestId = refreshRequestId;
    const expectedGameId = viewModel.gameId;

    if (refreshInFlight) {
      queuedRefresh = true;
      return;
    }

    refreshInFlight = refreshGameStateInternal(expectedGameId, requestId)
      .catch((error) => {
        onGameStateError(error);
      })
      .finally(() => {
        refreshInFlight = null;

        if (!queuedRefresh) {
          return;
        }

        queuedRefresh = false;
        refreshGameState();
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
        if (snapshot.gameStatus === "started" && snapshot.gameId !== null) {
          refreshGameState();
        } else {
          setGameView(null);
        }
        onLobbySnapshot(snapshot);
      },
      onLobbyUpdated: (snapshot) => {
        applyLobbyProjection(snapshot);
        onLobbyUpdated(snapshot);
      },
      onGameStarted: (payload) => {
        latestAppliedVersion = null;
        updateViewModel({
          gameId: payload.gameId,
          gameStatus: payload.gameStatus,
          pendingChoice: null,
          lastEventType: null
        });
        setGameView(null);
        refreshGameState();
        onGameStarted(payload);
      },
      onGameUpdated: (payload) => {
        const applied = trackAppliedVersion(payload);

        if (!applied) {
          return;
        }

        applyGameplayUpdate(payload);
        refreshGameState();
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
      return api.getRoomLobby(roomId).then((lobby) => {
        applyLobbyProjection(lobby);
        return lobby;
      });
    },
    fetchGameState() {
      return fetchGameStateInternal();
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

        if (!gameplayUpdateEndedGame(response)) {
          refreshGameState();
        }
      }
      return response;
    },
    getLatestAppliedVersion() {
      return latestAppliedVersion;
    },
    getViewModel() {
      return cloneViewModel(viewModel);
    },
    getGameView() {
      return gameView === null ? null : cloneGameView(gameView);
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
