"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createRoom, getActor, joinRoom } from "../../../lib/server-api";

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; payload: unknown }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type ServerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; actor: { userId: string; email: string } }
  | { status: "error"; message: string };

export function AuthVerificationState() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });
  const [serverState, setServerState] = useState<ServerState>({ status: "idle" });
  const [roomStatus, setRoomStatus] = useState<string>("");
  const [roomIdInput, setRoomIdInput] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin"
        });

        if (!response.ok) {
          throw new Error(`session request failed (${response.status})`);
        }

        const payload = (await response.json()) as unknown;

        if (cancelled) {
          return;
        }

        if (payload === null) {
          setSessionState({ status: "unauthenticated" });
          return;
        }

        setSessionState({ status: "authenticated", payload });
        setServerState({ status: "loading" });

        try {
          const actor = await getActor();

          if (!cancelled) {
            setServerState({ status: "ready", actor });
          }
        } catch (error) {
          if (cancelled) {
            return;
          }

          const message = error instanceof Error ? error.message : "unknown error";
          setServerState({ status: "error", message });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "unknown error";
        setSessionState({ status: "error", message });
      }
    }

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (sessionState.status === "loading") {
    return <p>Checking session...</p>;
  }

  if (sessionState.status === "unauthenticated") {
    return <p>No active session found.</p>;
  }

  if (sessionState.status === "error") {
    return <p>Session check failed: {sessionState.message}</p>;
  }

  async function handleCreateRoom() {
    setRoomStatus("Creating room...");

    try {
      const room = await createRoom();
      const shareUrl = `${window.location.origin}/play/${room.roomId}`;
      setRoomStatus(`Room created: ${shareUrl} (seat ${room.seat})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      setRoomStatus(`Create room failed: ${message}`);
    }
  }

  function getRoomIdFromInput() {
    const trimmed = roomIdInput.trim();

    if (!trimmed) {
      return "";
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const parsedUrl = new URL(trimmed);
        const parts = parsedUrl.pathname.split("/").filter(Boolean);

        if (parts.length >= 2 && parts[0] === "play") {
          return parts[1] ?? "";
        }
      } catch {
        return "";
      }
    }

    return trimmed;
  }

  async function handleJoinRoom() {
    const roomId = getRoomIdFromInput();

    if (!roomId) {
      setRoomStatus("Enter a room URL or room ID.");
      return;
    }

    setRoomStatus(`Joining room ${roomId}...`);

    try {
      const joined = await joinRoom(roomId);
      setRoomStatus(`Joined ${joined.roomId} as ${joined.userId} (seat ${joined.seat})`);
      router.push(`/play/${joined.roomId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      setRoomStatus(`Join room failed: ${message}`);
    }
  }

  return (
    <>
      <h2>Auth session payload</h2>
      <pre>{JSON.stringify(sessionState.payload, null, 2)}</pre>

      <h2>Server actor check</h2>
      {serverState.status === "idle" || serverState.status === "loading" ? (
        <p>Checking `/api/me`...</p>
      ) : null}
      {serverState.status === "error" ? (
        <p>Server auth check failed: {serverState.message}</p>
      ) : null}
      {serverState.status === "ready" ? (
        <pre>{JSON.stringify(serverState.actor, null, 2)}</pre>
      ) : null}

      <h2>Room endpoint smoke actions</h2>
      <button type="button" onClick={handleCreateRoom}>
        Create room
      </button>
      <input
        type="text"
        value={roomIdInput}
        onChange={(event) => setRoomIdInput(event.target.value)}
        placeholder="Paste /play/<roomId> URL or room ID"
      />
      <button type="button" onClick={handleJoinRoom}>
        Join room
      </button>
      {roomStatus ? <p>{roomStatus}</p> : null}
    </>
  );
}
