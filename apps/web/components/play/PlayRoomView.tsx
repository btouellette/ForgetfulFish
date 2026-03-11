import React from "react";
import Link from "next/link";
import type { RoomLobbySnapshot } from "@forgetful-fish/realtime-contract";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

import type { PlayLifecycleState } from "../../lib/play-lifecycle";
import type { RoomRealtimeStatus } from "../../lib/room-realtime";
import { GameplayView } from "./GameplayView";
import { LobbyView } from "./LobbyView";
import styles from "./PlayRoom.module.css";

type LobbyParticipant = RoomLobbySnapshot["participants"][number];

type PlayRoomViewProps = {
  roomId: string;
  status: string;
  gameStatus: "not_started" | "started";
  gameId: string | null;
  lifecycleState: PlayLifecycleState;
  connectionStatus: RoomRealtimeStatus;
  realtimeGuardrailMessage: string | null;
  participants: LobbyParticipant[];
  viewerId: string;
  isSubmittingLobbyAction: boolean;
  gameView: PlayerGameView | null;
  recentEvents: Array<{ seq: number; eventType: string }>;
  pendingChoice: GameplayPendingChoice | null;
  isSubmittingCommand: boolean;
  error: string | null;
  onReadyToggle: () => void;
  onStartGame: () => void;
  onPassPriority: () => void;
  onConcede: () => void;
  onMakeChoice: (payload: Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"]) => void;
  onClearError: () => void;
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
  gameView,
  recentEvents,
  pendingChoice,
  isSubmittingCommand,
  error,
  onReadyToggle,
  onStartGame,
  onPassPriority,
  onConcede,
  onMakeChoice,
  onClearError
}: PlayRoomViewProps) {
  return (
    <main className={styles.playRoom}>
      <h1>Play Room</h1>
      <p>{`Room: ${roomId}`}</p>
      <p>
        Game:{" "}
        {gameStatus === "started"
          ? gameId
            ? `started (${gameId})`
            : "started (loading...)"
          : "not started"}
      </p>
      <p>Lifecycle: {lifecycleState}</p>
      <p>Live connection: {connectionStatus}</p>
      {realtimeGuardrailMessage ? <p>{realtimeGuardrailMessage}</p> : null}
      {lifecycleState === "game_active" ? (
        <GameplayView
          gameView={gameView}
          recentEvents={recentEvents}
          pendingChoice={pendingChoice}
          isSubmittingCommand={isSubmittingCommand}
          error={error}
          onPassPriority={onPassPriority}
          onConcede={onConcede}
          onMakeChoice={onMakeChoice}
          onClearError={onClearError}
        />
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
