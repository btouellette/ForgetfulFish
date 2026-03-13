"use client";

import { useEffect, useRef, useState } from "react";

import type { RoomLobbySnapshot, GameplayCommand } from "@forgetful-fish/realtime-contract";
import {
  createGameSessionAdapter,
  type GameSessionViewModel,
  toSessionStatusMessage
} from "../../lib/game-session-adapter";
import {
  disconnectedLobbyPollIntervalMs,
  getReadyUpdateStatusMessage,
  getRealtimeGuardrailMessage,
  shouldPollLobbyWhileDisconnected
} from "../../lib/room-guardrails";
import type { RoomRealtimeStatus } from "../../lib/room-realtime";
import { ServerApiError } from "../../lib/server-api";
import { createGameStore } from "../../lib/stores/game-store";
import { GameStoreProvider, useGameStore, useGameStoreApi } from "./GameStoreContext";
import { PlayRoomView } from "./PlayRoomView";

type PlayRoomContainerProps = {
  roomId: string;
};

const emptyParticipants: RoomLobbySnapshot["participants"] = [];

function PlayRoomContainerContent({ roomId }: PlayRoomContainerProps) {
  const isMountedRef = useRef(true);
  const sessionAdapterRef = useRef<ReturnType<typeof createGameSessionAdapter> | null>(null);
  const [status, setStatus] = useState("Joining room...");
  const [viewerId, setViewerId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<RoomRealtimeStatus>("offline");
  const [joinFailed, setJoinFailed] = useState(false);
  const [isSubmittingLobbyAction, setIsSubmittingLobbyAction] = useState(false);

  const lobbySnapshot = useGameStore((state) => state.lobbySnapshot);
  const lifecycleState = useGameStore((state) => state.lifecycleState);
  const gameView = useGameStore((state) => state.gameView);
  const recentEvents = useGameStore((state) => state.recentEvents);
  const pendingChoice = useGameStore((state) => state.pendingChoice);
  const isSubmittingCommand = useGameStore((state) => state.isSubmittingCommand);
  const error = useGameStore((state) => state.error);
  const passPriority = useGameStore((state) => state.passPriority);
  const makeChoice = useGameStore((state) => state.makeChoice);
  const concede = useGameStore((state) => state.concede);
  const playLand = useGameStore((state) => state.playLand);
  const castSpell = useGameStore((state) => state.castSpell);
  const clearError = useGameStore((state) => state.clearError);
  const store = useGameStoreApi();
  const participants = lobbySnapshot?.participants ?? emptyParticipants;
  const gameStatus = lobbySnapshot?.gameStatus ?? "not_started";
  const gameId = lobbySnapshot?.gameId ?? null;

  async function refreshLobby() {
    const sessionAdapter = sessionAdapterRef.current;

    if (!sessionAdapter) {
      return;
    }

    await sessionAdapter.getRoomLobby();
  }

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function runJoin() {
      try {
        setJoinFailed(false);

        const sessionAdapter = createGameSessionAdapter({
          roomId,
          onStatusChange: (nextStatus) => {
            if (!isMountedRef.current) {
              return;
            }

            setConnectionStatus(nextStatus);
            store.getState().applyConnectionStatus(nextStatus);
          },
          onLobbySnapshot: () => {},
          onLobbyUpdated: () => {},
          onGameStarted: (started) => {
            if (!isMountedRef.current) {
              return;
            }

            setStatus(`Game started: ${started.gameId}`);
          },
          onViewModelChange: (viewModel: GameSessionViewModel) => {
            if (!isMountedRef.current) {
              return;
            }

            store.getState().applyViewModel(viewModel);
          },
          onGameViewChange: (gameView) => {
            if (!isMountedRef.current) {
              return;
            }

            store.getState().applyGameView(gameView);
          },
          onGameStateError: (error) => {
            if (!isMountedRef.current) {
              return;
            }

            const message = error instanceof Error ? error.message : "unknown error";
            setStatus(`Game-state refresh failed: ${message}`);
          }
        });

        store.getState().attachAdapter({
          fetchGameState: () => sessionAdapter.fetchGameState(),
          submitGameplayCommand: (command: GameplayCommand) =>
            sessionAdapter.submitGameplayCommand(command)
        });

        const joined = await sessionAdapter.joinRoom();

        if (cancelled) {
          return;
        }

        setViewerId(joined.userId);
        setStatus(`Joined room ${joined.roomId} as seat ${joined.seat}.`);

        sessionAdapterRef.current = sessionAdapter;
        sessionAdapter.connect();
      } catch (error) {
        if (cancelled) {
          return;
        }

        setJoinFailed(true);

        if (error instanceof ServerApiError) {
          if (error.status === 404) {
            setStatus("Join failed: Room not found.");
            return;
          }

          if (error.status === 409) {
            setStatus("Join failed: Room is full.");
            return;
          }
        }

        const sessionStatusMessage = toSessionStatusMessage(error);
        if (sessionStatusMessage) {
          setStatus(`Join failed: ${sessionStatusMessage}`);
          return;
        }

        const message = error instanceof Error ? error.message : "unknown error";
        setStatus(`Join failed: ${message}`);
      }
    }

    void runJoin();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      sessionAdapterRef.current?.disconnect();
      sessionAdapterRef.current = null;
    };
  }, [roomId, store]);

  useEffect(() => {
    if (!roomId || !shouldPollLobbyWhileDisconnected(connectionStatus)) {
      return;
    }

    let cancelled = false;

    const pollLobby = async () => {
      try {
        await refreshLobby();
      } catch {
        if (cancelled || !isMountedRef.current) {
          return;
        }
      }
    };

    void pollLobby();
    const pollTimer = setInterval(() => {
      void pollLobby();
    }, disconnectedLobbyPollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [connectionStatus, roomId]);

  async function handleReadyToggle() {
    if (!roomId || !viewerId || isSubmittingLobbyAction) {
      return;
    }

    const current = participants.find((participant) => participant.userId === viewerId);

    if (!current) {
      return;
    }

    setStatus(current.ready ? "Marking not ready..." : "Marking ready...");
    setIsSubmittingLobbyAction(true);

    try {
      const sessionAdapter = sessionAdapterRef.current;

      if (!sessionAdapter) {
        return;
      }

      const updated = await sessionAdapter.setRoomReady(!current.ready);

      if (!isMountedRef.current) {
        return;
      }

      setStatus(getReadyUpdateStatusMessage(updated.ready, connectionStatus));

      try {
        await refreshLobby();
      } catch {
        if (!isMountedRef.current) {
          return;
        }
      }
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const sessionStatusMessage = toSessionStatusMessage(error);
      if (sessionStatusMessage) {
        setStatus(`Ready update failed: ${sessionStatusMessage}`);
        return;
      }

      const message = error instanceof Error ? error.message : "unknown error";
      setStatus(`Ready update failed: ${message}`);
    } finally {
      if (isMountedRef.current) {
        setIsSubmittingLobbyAction(false);
      }
    }
  }

  async function handleStartGame() {
    if (!roomId || isSubmittingLobbyAction) {
      return;
    }

    setStatus("Starting game...");
    setIsSubmittingLobbyAction(true);

    try {
      const sessionAdapter = sessionAdapterRef.current;

      if (!sessionAdapter) {
        return;
      }

      const started = await sessionAdapter.startRoomGame();

      if (!isMountedRef.current) {
        return;
      }

      setStatus(`Game started: ${started.gameId}`);
      await refreshLobby();
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const sessionStatusMessage = toSessionStatusMessage(error);
      if (sessionStatusMessage) {
        setStatus(`Start failed: ${sessionStatusMessage}`);
        return;
      }

      const message = error instanceof Error ? error.message : "unknown error";
      setStatus(`Start failed: ${message}`);
    } finally {
      if (isMountedRef.current) {
        setIsSubmittingLobbyAction(false);
      }
    }
  }

  const realtimeGuardrailMessage = getRealtimeGuardrailMessage(connectionStatus);

  return (
    <PlayRoomView
      roomId={roomId}
      status={status}
      gameStatus={gameStatus}
      gameId={gameId}
      lifecycleState={joinFailed ? "error" : lifecycleState}
      connectionStatus={connectionStatus}
      realtimeGuardrailMessage={realtimeGuardrailMessage}
      participants={participants}
      viewerId={viewerId}
      isSubmittingLobbyAction={isSubmittingLobbyAction}
      gameView={gameView}
      recentEvents={recentEvents}
      pendingChoice={pendingChoice}
      isSubmittingCommand={isSubmittingCommand}
      error={error}
      onReadyToggle={handleReadyToggle}
      onStartGame={handleStartGame}
      onPassPriority={() => {
        void passPriority();
      }}
      onConcede={() => {
        void concede();
      }}
      onPlayLand={(cardId) => {
        void playLand(cardId);
      }}
      onCastSpell={(cardId) => {
        void castSpell(cardId);
      }}
      onMakeChoice={(payload) => {
        void makeChoice(payload);
      }}
      onClearError={clearError}
    />
  );
}

export function PlayRoomContainer({ roomId }: PlayRoomContainerProps) {
  const [store] = useState(() => createGameStore());

  return (
    <GameStoreProvider store={store}>
      <PlayRoomContainerContent roomId={roomId} />
    </GameStoreProvider>
  );
}
