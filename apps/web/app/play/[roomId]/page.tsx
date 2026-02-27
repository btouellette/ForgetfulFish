"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getRoomLobby, joinRoom, setRoomReady, startRoomGame } from "../../../lib/server-api";

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

  async function refreshLobby(nextRoomId: string) {
    const lobby = await getRoomLobby(nextRoomId);

    if (!isMountedRef.current) {
      return;
    }

    setParticipants(lobby.participants);
    setGameStatus(lobby.gameStatus);
    setGameId(lobby.gameId);
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
        const joined = await joinRoom(resolvedParams.roomId);

        if (cancelled) {
          return;
        }

        setViewerId(joined.userId);
        setStatus(`Joined room ${joined.roomId} as seat ${joined.seat}.`);
        await refreshLobby(joined.roomId);
      } catch (error) {
        if (cancelled) {
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
    };
  }, [params]);

  async function handleReadyToggle() {
    if (!roomId || !viewerId) {
      return;
    }

    const current = participants.find((participant) => participant.userId === viewerId);

    if (!current) {
      return;
    }

    setStatus(current.ready ? "Marking not ready..." : "Marking ready...");

    try {
      const updated = await setRoomReady(roomId, !current.ready);

      if (!isMountedRef.current) {
        return;
      }

      setStatus(`You are now ${updated.ready ? "ready" : "not ready"}.`);
      await refreshLobby(roomId);
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "unknown error";
      setStatus(`Ready update failed: ${message}`);
    }
  }

  async function handleStartGame() {
    if (!roomId) {
      return;
    }

    setStatus("Starting game...");

    try {
      const started = await startRoomGame(roomId);

      if (!isMountedRef.current) {
        return;
      }

      setStatus(`Game started: ${started.gameId}`);
      setGameStatus(started.gameStatus);
      setGameId(started.gameId);
      await refreshLobby(roomId);
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "unknown error";
      setStatus(`Start failed: ${message}`);
    }
  }

  const viewer = participants.find((participant) => participant.userId === viewerId);
  const canStart =
    gameStatus === "not_started" &&
    participants.length === 2 &&
    participants.every((participant) => participant.ready);

  return (
    <main className="home">
      <h1>Play Room</h1>
      <p>{roomId ? `Room: ${roomId}` : "Resolving room..."}</p>
      <p>Game: {gameStatus === "started" ? `started (${gameId})` : "not started"}</p>
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
        disabled={!viewer || gameStatus === "started"}
      >
        {viewer?.ready ? "Mark not ready" : "Mark ready"}
      </button>
      <button type="button" onClick={handleStartGame} disabled={!canStart}>
        Start game
      </button>
      <p>{status}</p>
      <p>
        <Link href="/auth/verify">Back to verification</Link>
      </p>
    </main>
  );
}
