import { createStore } from "zustand/vanilla";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView,
  RoomLobbySnapshot
} from "@forgetful-fish/realtime-contract";

import type { GameSessionViewModel } from "../game-session-adapter";
import { derivePlayLifecycleState, type PlayLifecycleState } from "../play-lifecycle";
import type { RoomRealtimeStatus } from "../room-realtime";

type GameStoreAdapter = {
  fetchGameState: () => Promise<PlayerGameView>;
  submitGameplayCommand: (command: GameplayCommand) => Promise<unknown>;
};

type MakeChoicePayload = Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"];

type GameStoreState = {
  viewModel: GameSessionViewModel | null;
  gameView: PlayerGameView | null;
  lifecycleState: PlayLifecycleState;
  lobbySnapshot: {
    participants: RoomLobbySnapshot["participants"];
    gameId: string | null;
    gameStatus: RoomLobbySnapshot["gameStatus"];
  } | null;
  pendingChoice: GameplayPendingChoice | null;
  recentEvents: Array<{ seq: number; eventType: string }>;
  isSubmittingCommand: boolean;
  isLoadingGameState: boolean;
  error: string | null;
  attachAdapter: (adapter: GameStoreAdapter) => void;
  applyConnectionStatus: (status: RoomRealtimeStatus) => void;
  applyViewModel: (viewModel: GameSessionViewModel) => void;
  applyGameView: (gameView: PlayerGameView | null) => void;
  clearError: () => void;
  fetchGameState: () => Promise<PlayerGameView>;
  passPriority: () => Promise<void>;
  makeChoice: (payload: MakeChoicePayload) => Promise<void>;
  concede: () => Promise<void>;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function createLobbySnapshot(viewModel: GameSessionViewModel) {
  return {
    participants: viewModel.participants,
    gameId: viewModel.gameId,
    gameStatus: viewModel.gameStatus
  };
}

function computeLifecycleState(params: {
  viewModel: GameSessionViewModel | null;
  hasError: boolean;
  connectionStatus: RoomRealtimeStatus;
}) {
  return derivePlayLifecycleState({
    isJoining: params.viewModel === null,
    hasError: params.hasError,
    gameStatus: params.viewModel?.gameStatus ?? "not_started",
    connectionStatus: params.connectionStatus
  });
}

export function createGameStore() {
  let adapter: GameStoreAdapter | null = null;
  let connectionStatus: RoomRealtimeStatus = "offline";

  const store = createStore<GameStoreState>((set, get) => ({
    viewModel: null,
    gameView: null,
    lifecycleState: "joining",
    lobbySnapshot: null,
    pendingChoice: null,
    recentEvents: [],
    isSubmittingCommand: false,
    isLoadingGameState: false,
    error: null,
    attachAdapter(nextAdapter) {
      adapter = nextAdapter;
    },
    applyConnectionStatus(status) {
      connectionStatus = status;
      set((state) => ({
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.error !== null,
          connectionStatus
        })
      }));
    },
    applyViewModel(viewModel) {
      set((state) => {
        const nextEvents = [...state.recentEvents];
        const latest = viewModel.latestAppliedVersion;

        if (latest && viewModel.lastEventType) {
          const previous = nextEvents[nextEvents.length - 1];

          if (
            !previous ||
            previous.seq !== latest.lastAppliedEventSeq ||
            previous.eventType !== viewModel.lastEventType
          ) {
            nextEvents.push({
              seq: latest.lastAppliedEventSeq,
              eventType: viewModel.lastEventType
            });
          }
        }

        return {
          viewModel,
          lobbySnapshot: createLobbySnapshot(viewModel),
          pendingChoice: viewModel.pendingChoice,
          recentEvents: nextEvents,
          lifecycleState: computeLifecycleState({
            viewModel,
            hasError: state.error !== null,
            connectionStatus
          })
        };
      });
    },
    applyGameView(gameView) {
      set({
        gameView,
        pendingChoice: gameView?.pendingChoice ?? get().pendingChoice
      });
    },
    clearError() {
      set((state) => ({
        error: null,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));
    },
    async fetchGameState() {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      set({ isLoadingGameState: true, error: null });

      try {
        const gameView = await adapter.fetchGameState();
        set({ gameView, pendingChoice: gameView.pendingChoice, isLoadingGameState: false });
        return gameView;
      } catch (error) {
        const message = toErrorMessage(error);
        set((state) => ({
          error: message,
          isLoadingGameState: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: true,
            connectionStatus
          })
        }));
        throw error;
      }
    },
    async passPriority() {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      set({ isSubmittingCommand: true, error: null });

      try {
        await adapter.submitGameplayCommand({ type: "PASS_PRIORITY" });
      } catch (error) {
        const message = toErrorMessage(error);
        set((state) => ({
          error: message,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: true,
            connectionStatus
          })
        }));
        throw error;
      }

      set({ isSubmittingCommand: false });
    },
    async makeChoice(payload) {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      set({ isSubmittingCommand: true, error: null });

      try {
        await adapter.submitGameplayCommand({ type: "MAKE_CHOICE", payload });
      } catch (error) {
        const message = toErrorMessage(error);
        set((state) => ({
          error: message,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: true,
            connectionStatus
          })
        }));
        throw error;
      }

      set({ isSubmittingCommand: false });
    },
    async concede() {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      set({ isSubmittingCommand: true, error: null });

      try {
        await adapter.submitGameplayCommand({ type: "CONCEDE" });
      } catch (error) {
        const message = toErrorMessage(error);
        set((state) => ({
          error: message,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: true,
            connectionStatus
          })
        }));
        throw error;
      }

      set({ isSubmittingCommand: false });
    }
  }));

  return store;
}

export type GameStore = ReturnType<typeof createGameStore>;
