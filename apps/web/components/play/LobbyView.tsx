import React from "react";
import styles from "./PlayRoom.module.css";

type Participant = {
  userId: string;
  seat: "P1" | "P2";
  ready: boolean;
};

type LobbyViewProps = {
  participants: Participant[];
  viewerId: string;
  gameStatus: "not_started" | "started";
  isSubmittingLobbyAction: boolean;
  onReadyToggle: () => void;
  onStartGame: () => void;
};

export function LobbyView({
  participants,
  viewerId,
  gameStatus,
  isSubmittingLobbyAction,
  onReadyToggle,
  onStartGame
}: LobbyViewProps) {
  const viewer = participants.find((participant) => participant.userId === viewerId);
  const canStart =
    gameStatus === "not_started" &&
    participants.length === 2 &&
    participants.every((participant) => participant.ready);

  return (
    <section className={styles.lobbyView}>
      <h2>Lobby</h2>
      {participants.length === 0 ? <p>No participants loaded.</p> : null}
      {participants.map((participant) => (
        <p key={participant.userId}>
          {participant.seat}: {participant.userId} ({participant.ready ? "ready" : "not ready"})
        </p>
      ))}
      <button
        type="button"
        onClick={onReadyToggle}
        disabled={!viewer || gameStatus === "started" || isSubmittingLobbyAction}
      >
        {viewer?.ready ? "Mark not ready" : "Mark ready"}
      </button>
      <button type="button" onClick={onStartGame} disabled={!canStart || isSubmittingLobbyAction}>
        Start game
      </button>
    </section>
  );
}
