"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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
import type { GameplayCommand } from "@forgetful-fish/realtime-contract";
import { ServerApiError } from "../../lib/server-api";
import { createGameStore } from "../../lib/stores/game-store";
import { GameStoreProvider, useGameStore, useGameStoreApi } from "./GameStoreContext";
import styles from "./PlayRoom.module.css";

type PlayRoomContainerProps = {
  roomId: string;
};

const emptyParticipants: Array<{ userId: string; seat: "P1" | "P2"; ready: boolean }> = [];

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

  const viewer = participants.find((participant) => participant.userId === viewerId);
  const realtimeGuardrailMessage = getRealtimeGuardrailMessage(connectionStatus);
  const canStart =
    gameStatus === "not_started" &&
    participants.length === 2 &&
    participants.every((participant) => participant.ready);

  return (
    <main className={styles.playRoom}>
      <h1>Play Room</h1>
      <p>{`Room: ${roomId}`}</p>
      <p>Game: {gameStatus === "started" ? `started (${gameId})` : "not started"}</p>
      <p>Lifecycle: {joinFailed ? "error" : lifecycleState}</p>
      <p>Live connection: {connectionStatus}</p>
      {realtimeGuardrailMessage ? <p>{realtimeGuardrailMessage}</p> : null}
      <h2>Lobby</h2>
      {participants.length === 0 ? <p>No participants loaded.</p> : null}
      {participants.map((participant) => (
        <p key={participant.userId}>
          {participant.seat}: {participant.userId} ({participant.ready ? "ready" : "not ready"})
        </p>
      ))}
      <button
        type="button"
        onClick={handleReadyToggle}
        disabled={!viewer || gameStatus === "started" || isSubmittingLobbyAction}
      >
        {viewer?.ready ? "Mark not ready" : "Mark ready"}
      </button>
      <button
        type="button"
        onClick={handleStartGame}
        disabled={!canStart || isSubmittingLobbyAction}
      >
        Start game
      </button>
      <p>{status}</p>
      <p>
        <Link href="/auth/verify">Back to verification</Link>
      </p>
    </main>
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
