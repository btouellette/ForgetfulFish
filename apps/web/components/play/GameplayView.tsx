"use client";

import React from "react";
import { useEffect, useRef } from "react";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

import { renderBattlefield } from "../../lib/renderer/battlefield-renderer";
import { CommandPanel } from "./CommandPanel";
import { EventRail } from "./EventRail";
import { StatusRail } from "./StatusRail";
import { ZonesSummaryPanel } from "./ZonesSummaryPanel";
import { CanvasHost } from "./renderer/CanvasHost";
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameView || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const battlefieldObjects = Object.values(gameView.objectPool).filter(
      (object) => object.zone.kind === "battlefield"
    );

    rafRef.current = window.requestAnimationFrame(() => {
      renderBattlefield(
        context,
        battlefieldObjects,
        canvas.width,
        canvas.height,
        gameView.viewerPlayerId
      );
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [gameView]);

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
        <CanvasHost ref={canvasRef} />
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
          onMakeChoice={onMakeChoice}
          onClearError={onClearError}
        />
        <ZonesSummaryPanel viewerPlayerId={gameView.viewerPlayerId} zones={gameView.zones} />
        <EventRail recentEvents={recentEvents} />
      </div>
    </section>
  );
}
