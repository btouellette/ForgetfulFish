"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GameplayCommand,
  GameplayPendingChoice,
  PlayerGameView
} from "@forgetful-fish/realtime-contract";

import { shouldAutoPass } from "../../lib/auto-pass";
import { renderBattlefield } from "../../lib/renderer/battlefield-renderer";
import { CommandPanel } from "./CommandPanel";
import { EventRail } from "./EventRail";
import { HandPanel } from "./HandPanel";
import { StackPanel } from "./StackPanel";
import { StatusRail } from "./StatusRail";
import { ZonesSummaryPanel } from "./ZonesSummaryPanel";
import { CanvasHost } from "./renderer/CanvasHost";
import styles from "./PlayRoom.module.css";

const autoPassPreferenceStorageKey = "ff:autoPassEnabled";

type GameplayViewProps = {
  gameView: PlayerGameView | null;
  recentEvents: Array<{ seq: number; eventType: string }>;
  pendingChoice: GameplayPendingChoice | null;
  isSubmittingCommand: boolean;
  error: string | null;
  onPassPriority: () => void;
  onConcede: () => void;
  onPlayLand: (cardId: string) => void;
  onCastSpell: (
    cardId: string,
    targets?: NonNullable<Extract<GameplayCommand, { type: "CAST_SPELL" }>["targets"]>
  ) => void;
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
  onPlayLand,
  onCastSpell,
  onMakeChoice,
  onClearError
}: GameplayViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [canvasVersion, setCanvasVersion] = useState(0);
  const [targetingCardId, setTargetingCardId] = useState<string | null>(null);
  const [autoPassEnabled, setAutoPassEnabled] = useState(false);
  const lastAutoPassedStateVersionRef = useRef<number | null>(null);
  const skipNextAutoPassPersistRef = useRef(true);

  const handleCanvasResize = useCallback(() => {
    setCanvasVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!gameView || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(0, rect.width);
    const cssHeight = Math.max(0, rect.height);
    const dpr = cssWidth > 0 ? canvas.width / cssWidth : 1;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const battlefieldObjects = Object.values(gameView.objectPool).filter(
      (object) => object.zone.kind === "battlefield"
    );

    rafRef.current = window.requestAnimationFrame(() => {
      renderBattlefield(context, battlefieldObjects, cssWidth, cssHeight, gameView.viewerPlayerId);
      rafRef.current = null;
    });

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [gameView, canvasVersion]);

  const handleBeginTargetedCast = useCallback(
    (cardId: string) => {
      if (!gameView || gameView.turnState.priorityPlayerId !== gameView.viewerPlayerId) {
        return;
      }

      setTargetingCardId(cardId);
    },
    [gameView]
  );

  const activeTargetingCardId =
    targetingCardId && (gameView?.viewer.hand.some((card) => card.id === targetingCardId) ?? false)
      ? targetingCardId
      : null;

  const handleSelectStackTarget = useCallback(
    (
      target: Extract<
        NonNullable<Extract<GameplayCommand, { type: "CAST_SPELL" }>["targets"]>[number],
        { kind: "object" }
      >
    ) => {
      if (!activeTargetingCardId) {
        return;
      }

      if (!gameView || gameView.turnState.priorityPlayerId !== gameView.viewerPlayerId) {
        return;
      }

      onCastSpell(activeTargetingCardId, [target]);
      setTargetingCardId(null);
    },
    [activeTargetingCardId, gameView, onCastSpell]
  );

  const handleCancelTargetSelection = useCallback(() => {
    setTargetingCardId(null);
  }, []);

  const targetingCardLabel = activeTargetingCardId
    ? (gameView?.objectPool[activeTargetingCardId]?.cardDefId ?? activeTargetingCardId)
    : null;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const savedPreference = window.localStorage.getItem(autoPassPreferenceStorageKey);
      if (savedPreference === "true") {
        setAutoPassEnabled(true);
      }
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (skipNextAutoPassPersistRef.current) {
      skipNextAutoPassPersistRef.current = false;
      return;
    }

    try {
      window.localStorage.setItem(autoPassPreferenceStorageKey, autoPassEnabled ? "true" : "false");
    } catch {
      return;
    }
  }, [autoPassEnabled]);

  useEffect(() => {
    if (!gameView) {
      return;
    }

    const viewerHasPriority = gameView.turnState.priorityPlayerId === gameView.viewerPlayerId;
    if (
      !autoPassEnabled ||
      !viewerHasPriority ||
      isSubmittingCommand ||
      pendingChoice !== null ||
      lastAutoPassedStateVersionRef.current === gameView.stateVersion ||
      !shouldAutoPass(gameView)
    ) {
      return;
    }

    lastAutoPassedStateVersionRef.current = gameView.stateVersion;
    onPassPriority();
  }, [autoPassEnabled, gameView, isSubmittingCommand, onPassPriority, pendingChoice]);

  if (!gameView) {
    return (
      <section className={styles.gameplayView} data-testid="game-active-placeholder">
        <h2>Gameplay shell placeholder</h2>
        <p>Waiting for projected game state...</p>
      </section>
    );
  }

  const viewerHasPriority = gameView.turnState.priorityPlayerId === gameView.viewerPlayerId;

  return (
    <section className={styles.gameplayView}>
      <div className={styles.canvasArea}>
        <CanvasHost ref={canvasRef} onResize={handleCanvasResize} />
      </div>
      <div className={styles.sidebar}>
        <StatusRail
          viewerPlayerId={gameView.viewerPlayerId}
          turnState={gameView.turnState}
          viewerLife={gameView.viewer.life}
          opponentLife={gameView.opponent.life}
        />
        <HandPanel
          hand={gameView.viewer.hand}
          viewerHasPriority={viewerHasPriority}
          isSubmitting={isSubmittingCommand}
          onPlayLand={onPlayLand}
          onCastSpell={onCastSpell}
          onBeginTargetedCast={handleBeginTargetedCast}
        />
        <StackPanel
          stack={gameView.stack}
          objectPool={gameView.objectPool}
          viewerHasPriority={viewerHasPriority}
          isSubmitting={isSubmittingCommand}
          targetingCardLabel={targetingCardLabel}
          onSelectStackTarget={handleSelectStackTarget}
          onCancelTargetSelection={handleCancelTargetSelection}
        />
        <CommandPanel
          viewerPlayerId={gameView.viewerPlayerId}
          gameView={gameView}
          pendingChoice={pendingChoice}
          viewerHasPriority={viewerHasPriority}
          isSubmitting={isSubmittingCommand}
          error={error}
          autoPassEnabled={autoPassEnabled}
          onAutoPassEnabledChange={setAutoPassEnabled}
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
