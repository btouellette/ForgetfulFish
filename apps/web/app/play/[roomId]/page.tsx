"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { joinRoom } from "../../../lib/server-api";

type PlayRoomPageProps = {
  params: Promise<{
    roomId: string;
  }>;
};

export default function PlayRoomPage({ params }: PlayRoomPageProps) {
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState("Joining room...");

  useEffect(() => {
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

        setStatus(`Joined room ${joined.roomId} as seat ${joined.seat}.`);
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
    };
  }, [params]);

  return (
    <main className="home">
      <h1>Play Room</h1>
      <p>{roomId ? `Room: ${roomId}` : "Resolving room..."}</p>
      <p>{status}</p>
      <p>
        <Link href="/auth/verify">Back to verification</Link>
      </p>
    </main>
  );
}
