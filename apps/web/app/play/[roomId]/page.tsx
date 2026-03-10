"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  createGameSessionAdapter,
  type GameSessionViewModel,
  toSessionStatusMessage
} from "../../../lib/game-session-adapter";
import {
  disconnectedLobbyPollIntervalMs,
  getReadyUpdateStatusMessage,
  getRealtimeGuardrailMessage,
  shouldPollLobbyWhileDisconnected
} from "../../../lib/room-guardrails";
import { derivePlayLifecycleState } from "../../../lib/play-lifecycle";
import type { RoomRealtimeStatus } from "../../../lib/room-realtime";
import { ServerApiError } from "../../../lib/server-api";

type PlayRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default function PlayRoomPage({ params }: PlayRoomPageProps) {
  const isMountedRef = useRef(true);
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState("Joining room...");
  const [participants, setParticipants] = useState<
    Array<{ userId: string; seat: "P1" | "P2"; ready: boolean }>
  >([]);
  const [viewerId, setViewerId] = useState("");
  const [gameStatus, setGameStatus] = useState<"not_started" | "started">("not_started");
  const [gameId, setGameId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<RoomRealtimeStatus>("offline");
  const [joinFailed, setJoinFailed] = useState(false);
  const sessionAdapterRef = useRef<ReturnType<typeof createGameSessionAdapter> | null>(null);

  function applyViewModel(viewModel: GameSessionViewModel) {
    if (!isMountedRef.current) {
      return;
    }

    setParticipants(viewModel.participants);
    setGameStatus(viewModel.gameStatus);
    setGameId(viewModel.gameId);
  }

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
      const resolvedParams = await params;

      if (cancelled) {
        return;
      }

      setRoomId(resolvedParams.roomId);

      try {
        setJoinFailed(false);
        const sessionAdapter = createGameSessionAdapter({
          roomId: resolvedParams.roomId,
          onStatusChange: (nextStatus) => {
            if (!isMountedRef.current) {
              return;
            }

            setConnectionStatus(nextStatus);
          },
          onLobbySnapshot: () => {},
          onLobbyUpdated: () => {},
          onGameStarted: (started) => {
            if (!isMountedRef.current) {
              return;
            }

            setStatus(`Game started: ${started.gameId}`);
          },
          onViewModelChange: (viewModel) => {
            applyViewModel(viewModel);
          }
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
  }, [params]);

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
    if (!roomId || !viewerId || isSubmitting) {
      return;
    }

    const current = participants.find((participant) => participant.userId === viewerId);

    if (!current) {
      return;
    }

    setStatus(current.ready ? "Marking not ready..." : "Marking ready...");
    setIsSubmitting(true);

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
        setIsSubmitting(false);
      }
    }
  }

  async function handleStartGame() {
    if (!roomId || isSubmitting) {
      return;
    }

    setStatus("Starting game...");
    setIsSubmitting(true);

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
      setGameStatus(started.gameStatus);
      setGameId(started.gameId);
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
        setIsSubmitting(false);
      }
    }
  }

  const viewer = participants.find((participant) => participant.userId === viewerId);
  const realtimeGuardrailMessage = getRealtimeGuardrailMessage(connectionStatus);
  const lifecycleState = derivePlayLifecycleState({
    isJoining: !viewerId && !joinFailed,
    hasError: joinFailed,
    gameStatus,
    connectionStatus
  });
  const canStart =
    gameStatus === "not_started" &&
    participants.length === 2 &&
    participants.every((participant) => participant.ready);

  return (
    <main className="home">
      <h1>Play Room</h1>
      <p>{roomId ? `Room: ${roomId}` : "Resolving room..."}</p>
      <p>Game: {gameStatus === "started" ? `started (${gameId})` : "not started"}</p>
      <p>Lifecycle: {lifecycleState}</p>
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
        disabled={!viewer || gameStatus === "started" || isSubmitting}
      >
        {viewer?.ready ? "Mark not ready" : "Mark ready"}
      </button>
      <button type="button" onClick={handleStartGame} disabled={!canStart || isSubmitting}>
        Start game
      </button>
      <p>{status}</p>
      <p>
        <Link href="/auth/verify">Back to verification</Link>
      </p>
    </main>
  );
}
