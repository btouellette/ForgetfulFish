import React from "react";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import styles from "./StatusRail.module.css";

type StatusRailProps = {
  viewerPlayerId: string;
  turnState: PlayerGameView["turnState"];
  viewerLife: number;
  opponentLife: number;
};

const phaseLabels: Record<PlayerGameView["turnState"]["phase"], string> = {
  UNTAP: "Untap",
  UPKEEP: "Upkeep",
  DRAW: "Draw",
  MAIN_1: "Main 1",
  BEGIN_COMBAT: "Begin Combat",
  DECLARE_ATTACKERS: "Declare Attackers",
  DECLARE_BLOCKERS: "Declare Blockers",
  COMBAT_DAMAGE: "Combat Damage",
  END_COMBAT: "End Combat",
  MAIN_2: "Main 2",
  END: "End",
  CLEANUP: "Cleanup"
};

function formatPlayerLabel(playerId: string, viewerPlayerId: string) {
  return playerId === viewerPlayerId ? "You" : "Opponent";
}

export function StatusRail({
  viewerPlayerId,
  turnState,
  viewerLife,
  opponentLife
}: StatusRailProps) {
  return (
    <section className={styles.statusRail}>
      <h3>Status</h3>
      <div className={styles.statRow}>
        <span>Phase</span>
        <strong>{phaseLabels[turnState.phase]}</strong>
      </div>
      <div className={styles.statRow}>
        <span>Active player</span>
        <strong>{formatPlayerLabel(turnState.activePlayerId, viewerPlayerId)}</strong>
      </div>
      <div className={styles.statRow}>
        <span>Priority</span>
        <strong>{formatPlayerLabel(turnState.priorityPlayerId, viewerPlayerId)}</strong>
      </div>
      <div className={styles.statRow}>
        <span>You</span>
        <strong>{viewerLife}</strong>
      </div>
      <div className={styles.statRow}>
        <span>Opponent</span>
        <strong>{opponentLife}</strong>
      </div>
    </section>
  );
}
