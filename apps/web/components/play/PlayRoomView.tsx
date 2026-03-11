import React from "react";
import Link from "next/link";

import type { PlayLifecycleState } from "../../lib/play-lifecycle";
import type { RoomRealtimeStatus } from "../../lib/room-realtime";
import { LobbyView } from "./LobbyView";
import styles from "./PlayRoom.module.css";

type Participant = {
  userId: string;
  seat: "P1" | "P2";
  ready: boolean;
};

type PlayRoomViewProps = {
  roomId: string;
  status: string;
  gameStatus: "not_started" | "started";
  gameId: string | null;
  lifecycleState: PlayLifecycleState;
  connectionStatus: RoomRealtimeStatus;
  realtimeGuardrailMessage: string | null;
  participants: Participant[];
  viewerId: string;
  isSubmittingLobbyAction: boolean;
  onReadyToggle: () => void;
  onStartGame: () => void;
};

export function PlayRoomView({
  roomId,
  status,
  gameStatus,
  gameId,
  lifecycleState,
  connectionStatus,
  realtimeGuardrailMessage,
  participants,
  viewerId,
  isSubmittingLobbyAction,
  onReadyToggle,
  onStartGame
}: PlayRoomViewProps) {
  return (
    <main className={styles.playRoom}>
      <h1>Play Room</h1>
      <p>{`Room: ${roomId}`}</p>
      <p>Game: {gameStatus === "started" ? `started (${gameId})` : "not started"}</p>
      <p>Lifecycle: {lifecycleState}</p>
      <p>Live connection: {connectionStatus}</p>
      {realtimeGuardrailMessage ? <p>{realtimeGuardrailMessage}</p> : null}
      {lifecycleState === "game_active" ? (
        <section className={styles.gameplayView} data-testid="game-active-placeholder">
          <h2>Gameplay shell placeholder</h2>
          <p>Gameplay presentation stays intentionally minimal until T14 lands.</p>
        </section>
      ) : (
        <LobbyView
          participants={participants}
          viewerId={viewerId}
          gameStatus={gameStatus}
          isSubmittingLobbyAction={isSubmittingLobbyAction}
          onReadyToggle={onReadyToggle}
          onStartGame={onStartGame}
        />
      )}
      <p>{status}</p>
      <p>
        <Link href="/auth/verify">Back to verification</Link>
      </p>
    </main>
  );
}
