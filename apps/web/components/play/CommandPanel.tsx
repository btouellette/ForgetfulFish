import React from "react";
import type { GameplayCommand, GameplayPendingChoice } from "@forgetful-fish/realtime-contract";

import { parsePendingChoice } from "../../lib/pending-choice";

import styles from "./CommandPanel.module.css";

type MakeChoicePayload = Extract<GameplayCommand, { type: "MAKE_CHOICE" }>["payload"];

type CommandPanelProps = {
  viewerPlayerId: string;
  pendingChoice: GameplayPendingChoice | null;
  isSubmitting: boolean;
  error: string | null;
  onPassPriority: () => void;
  onConcede: () => void;
  onMakeChoice: (payload: MakeChoicePayload) => void;
  onClearError: () => void;
};

export function CommandPanel({
  viewerPlayerId,
  pendingChoice,
  isSubmitting,
  error,
  onPassPriority,
  onConcede,
  onMakeChoice,
  onClearError
}: CommandPanelProps) {
  const parsedPendingChoice = pendingChoice ? parsePendingChoice(pendingChoice) : null;
  const isPendingChoiceForViewer =
    pendingChoice !== null && pendingChoice.forPlayer === viewerPlayerId;

  function handleConcede() {
    if (typeof window === "undefined") {
      onConcede();
      return;
    }

    if (window.confirm("Concede the game?")) {
      onConcede();
    }
  }

  return (
    <section className={styles.commandPanel}>
      <h3>Commands</h3>
      {error ? (
        <div className={styles.errorBanner}>
          <span>{error}</span>
          <button type="button" onClick={onClearError}>
            Dismiss
          </button>
        </div>
      ) : null}
      {pendingChoice ? (
        <div className={styles.choiceCard}>
          <strong>Pending choice</strong>
          <span>{pendingChoice.prompt}</span>
          {!isPendingChoiceForViewer ? (
            <span>Waiting for opponent choice.</span>
          ) : parsedPendingChoice?.kind === "yes_no" ? (
            <div className={styles.actionRow}>
              <button
                type="button"
                onClick={() => onMakeChoice({ type: "CHOOSE_YES_NO", accepted: true })}
                disabled={isSubmitting}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onMakeChoice({ type: "CHOOSE_YES_NO", accepted: false })}
                disabled={isSubmitting}
              >
                No
              </button>
            </div>
          ) : parsedPendingChoice?.kind === "invalid" ? (
            <span>Choice payload is invalid. Waiting for refresh.</span>
          ) : (
            <span>Waiting for a supported choice action.</span>
          )}
        </div>
      ) : null}
      <div className={styles.actionRow}>
        <button type="button" onClick={onPassPriority} disabled={isSubmitting}>
          Pass priority
        </button>
        <button
          type="button"
          className={styles.dangerButton}
          onClick={handleConcede}
          disabled={isSubmitting}
        >
          Concede game
        </button>
      </div>
    </section>
  );
}
