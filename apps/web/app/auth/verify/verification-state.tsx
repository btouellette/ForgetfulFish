"use client";

import { useEffect, useState } from "react";

type SessionState =
  | { status: "loading" }
  | { status: "authenticated"; payload: unknown }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export function AuthVerificationState() {
  const [sessionState, setSessionState] = useState<SessionState>({ status: "loading" });

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

  return <pre>{JSON.stringify(sessionState.payload, null, 2)}</pre>;
}
