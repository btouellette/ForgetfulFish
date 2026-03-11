import React from "react";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

import { CommandPanel } from "./CommandPanel";
import { EventRail } from "./EventRail";
import { StatusRail } from "./StatusRail";
import { ZonesSummaryPanel } from "./ZonesSummaryPanel";
import styles from "./PlayRoom.module.css";

type GameplayViewProps = {
  gameView: PlayerGameView | null;
  recentEvents: Array<{ seq: number; eventType: string }>;
  pendingChoice: GameplayPendingChoice | null;
  isSubmittingCommand: boolean;
  error: string | null;
  onPassPriority: () => void;
  onConcede: () => void;
  onMakeChoice: (payload: Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"]) => void;
  onClearError: () => void;
};

export function GameplayView({
  gameView,
  recentEvents,
  pendingChoice,
  isSubmittingCommand,
  error,
  onPassPriority,
  onConcede,
  onMakeChoice,
  onClearError
}: GameplayViewProps) {
  if (!gameView) {
    return (
      <section className={styles.gameplayView} data-testid="game-active-placeholder">
        <h2>Gameplay shell placeholder</h2>
        <p>Waiting for projected game state...</p>
      </section>
    );
  }

  return (
    <section className={styles.gameplayView}>
      <div className={styles.canvasArea}>
        <h2>Canvas placeholder</h2>
        <p>Battlefield rendering lands in the next shell-integration slices.</p>
      </div>
      <div className={styles.sidebar}>
        <StatusRail
          viewerPlayerId={gameView.viewerPlayerId}
          turnState={gameView.turnState}
          viewerLife={gameView.viewer.life}
          opponentLife={gameView.opponent.life}
        />
        <CommandPanel
          pendingChoice={pendingChoice}
          isSubmitting={isSubmittingCommand}
          error={error}
          onPassPriority={onPassPriority}
          onConcede={onConcede}
          onMakeChoice={(payload) => onMakeChoice(payload)}
          onClearError={onClearError}
        />
        <ZonesSummaryPanel viewerPlayerId={gameView.viewerPlayerId} zones={gameView.zones} />
        <EventRail recentEvents={recentEvents} />
      </div>
    </section>
  );
}
