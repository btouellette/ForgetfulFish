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
import { ServerApiError } from "../server-api";

type GameStoreAdapter = {
  fetchGameState: () => Promise<PlayerGameView>;
  submitGameplayCommand: (command: GameplayCommand) => Promise<unknown>;
};

type MakeChoicePayload = Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"];
type CastSpellCommand = Extract<GameplayCommand, { type: "CAST_SPELL" }>;
type CastSpellTargets = NonNullable<CastSpellCommand["targets"]>;
const maxRecentEvents = 10;

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
  errorAffectsLifecycle: boolean;
  attachAdapter: (adapter: GameStoreAdapter) => void;
  applyConnectionStatus: (status: RoomRealtimeStatus) => void;
  applyViewModel: (viewModel: GameSessionViewModel) => void;
  applyGameView: (gameView: PlayerGameView | null) => void;
  clearError: () => void;
  fetchGameState: () => Promise<PlayerGameView>;
  passPriority: () => Promise<void>;
  playLand: (cardId: string) => Promise<void>;
  castSpell: (cardId: CastSpellCommand["cardId"], targets?: CastSpellTargets) => Promise<void>;
  makeChoice: (payload: MakeChoicePayload) => Promise<void>;
  concede: () => Promise<void>;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown error";
}

function toCommandErrorMessage(error: unknown) {
  if (error instanceof ServerApiError) {
    if (error.status === 409) {
      return "That action is not legal right now.";
    }

    if (error.status === 401 || error.status === 403) {
      return "Session issue detected. Re-verify your sign-in and try again.";
    }

    if (error.status >= 500) {
      return "Server issue detected. Wait a moment, then try again.";
    }

    return "Command was rejected. Wait for the next state refresh, then try again.";
  }

  return "Command failed. Wait for the next state refresh, then try again.";
}

function commandErrorAffectsLifecycle(error: unknown) {
  return !(error instanceof ServerApiError && error.status === 409);
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

function trimRecentEvents(recentEvents: Array<{ seq: number; eventType: string }>) {
  return recentEvents.slice(-maxRecentEvents);
}

function viewerHasPriority(gameView: PlayerGameView | null) {
  return gameView === null || gameView.turnState.priorityPlayerId === gameView.viewerPlayerId;
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
    errorAffectsLifecycle: false,
    attachAdapter(nextAdapter) {
      adapter = nextAdapter;
    },
    applyConnectionStatus(status) {
      connectionStatus = status;
      set((state) => ({
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.errorAffectsLifecycle,
          connectionStatus
        })
      }));
    },
    applyViewModel(viewModel) {
      set((state) => {
        const gameChanged = state.viewModel?.gameId !== viewModel.gameId;
        const nextEvents =
          gameChanged || viewModel.latestAppliedVersion === null ? [] : [...state.recentEvents];
        const latest = viewModel.latestAppliedVersion;
        const shouldPreservePendingChoice =
          viewModel.pendingChoice === null &&
          !gameChanged &&
          viewModel.gameStatus === "started" &&
          viewModel.gameId !== null &&
          state.viewModel?.gameId !== null &&
          viewModel.latestAppliedVersion === null;

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
          pendingChoice: shouldPreservePendingChoice
            ? state.pendingChoice
            : viewModel.pendingChoice,
          recentEvents: trimRecentEvents(nextEvents),
          lifecycleState: computeLifecycleState({
            viewModel,
            hasError: state.errorAffectsLifecycle,
            connectionStatus
          })
        };
      });
    },
    applyGameView(gameView) {
      set({
        gameView,
        pendingChoice: gameView ? gameView.pendingChoice : get().pendingChoice
      });
    },
    clearError() {
      set((state) => ({
        error: null,
        errorAffectsLifecycle: false,
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

      set((state) => ({
        isLoadingGameState: true,
        error: null,
        errorAffectsLifecycle: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));

      try {
        const gameView = await adapter.fetchGameState();
        set((state) => ({
          gameView,
          pendingChoice: gameView.pendingChoice,
          isLoadingGameState: false,
          errorAffectsLifecycle: state.errorAffectsLifecycle,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: state.errorAffectsLifecycle,
            connectionStatus
          })
        }));
        return gameView;
      } catch (error) {
        const message = toErrorMessage(error);
        set((state) => ({
          error: message,
          errorAffectsLifecycle: true,
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

      if (!viewerHasPriority(get().gameView)) {
        return;
      }

      set((state) => ({
        isSubmittingCommand: true,
        error: null,
        errorAffectsLifecycle: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));

      try {
        await adapter.submitGameplayCommand({ type: "PASS_PRIORITY" });
      } catch (error) {
        const message = toCommandErrorMessage(error);
        const hasFatalError = commandErrorAffectsLifecycle(error);
        set((state) => ({
          error: message,
          errorAffectsLifecycle: hasFatalError,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: hasFatalError,
            connectionStatus
          })
        }));
        throw error;
      }
      set((state) => ({
        isSubmittingCommand: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.errorAffectsLifecycle,
          connectionStatus
        })
      }));
    },
    async makeChoice(payload) {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      set((state) => ({
        isSubmittingCommand: true,
        error: null,
        errorAffectsLifecycle: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));

      try {
        await adapter.submitGameplayCommand({ type: "MAKE_CHOICE", payload });
      } catch (error) {
        const message = toCommandErrorMessage(error);
        const hasFatalError = commandErrorAffectsLifecycle(error);
        set((state) => ({
          error: message,
          errorAffectsLifecycle: hasFatalError,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: hasFatalError,
            connectionStatus
          })
        }));
        throw error;
      }
      set((state) => ({
        isSubmittingCommand: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.errorAffectsLifecycle,
          connectionStatus
        })
      }));
    },
    async playLand(cardId) {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      if (!viewerHasPriority(get().gameView)) {
        return;
      }

      set((state) => ({
        isSubmittingCommand: true,
        error: null,
        errorAffectsLifecycle: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));

      try {
        await adapter.submitGameplayCommand({ type: "PLAY_LAND", cardId });
      } catch (error) {
        const message = toCommandErrorMessage(error);
        const hasFatalError = commandErrorAffectsLifecycle(error);
        set((state) => ({
          error: message,
          errorAffectsLifecycle: hasFatalError,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: hasFatalError,
            connectionStatus
          })
        }));
        throw error;
      }

      set((state) => ({
        isSubmittingCommand: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.errorAffectsLifecycle,
          connectionStatus
        })
      }));
    },
    async castSpell(cardId, targets) {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      if (!viewerHasPriority(get().gameView)) {
        return;
      }

      set((state) => ({
        isSubmittingCommand: true,
        error: null,
        errorAffectsLifecycle: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));

      try {
        await adapter.submitGameplayCommand({
          type: "CAST_SPELL",
          cardId,
          ...(targets ? { targets } : {})
        });
      } catch (error) {
        const message = toCommandErrorMessage(error);
        const hasFatalError = commandErrorAffectsLifecycle(error);
        set((state) => ({
          error: message,
          errorAffectsLifecycle: hasFatalError,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: hasFatalError,
            connectionStatus
          })
        }));
        throw error;
      }

      set((state) => ({
        isSubmittingCommand: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.errorAffectsLifecycle,
          connectionStatus
        })
      }));
    },
    async concede() {
      if (!adapter) {
        throw new Error("game store adapter is not attached");
      }

      set((state) => ({
        isSubmittingCommand: true,
        error: null,
        errorAffectsLifecycle: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: false,
          connectionStatus
        })
      }));

      try {
        await adapter.submitGameplayCommand({ type: "CONCEDE" });
      } catch (error) {
        const message = toCommandErrorMessage(error);
        const hasFatalError = commandErrorAffectsLifecycle(error);
        set((state) => ({
          error: message,
          errorAffectsLifecycle: hasFatalError,
          isSubmittingCommand: false,
          lifecycleState: computeLifecycleState({
            viewModel: state.viewModel,
            hasError: hasFatalError,
            connectionStatus
          })
        }));
        throw error;
      }
      set((state) => ({
        isSubmittingCommand: false,
        lifecycleState: computeLifecycleState({
          viewModel: state.viewModel,
          hasError: state.errorAffectsLifecycle,
          connectionStatus
        })
      }));
    }
  }));

  return store;
}

export type GameStore = ReturnType<typeof createGameStore>;
