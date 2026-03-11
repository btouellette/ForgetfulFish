import React from "react";
import type { GameplayPendingChoice } from "@forgetful-fish/realtime-contract";

import styles from "./CommandPanel.module.css";

type CommandPanelProps = {
  pendingChoice: GameplayPendingChoice | null;
  isSubmitting: boolean;
  error: string | null;
  onPassPriority: () => void;
  onConcede: () => void;
  onMakeChoice: (payload: { type: "CHOOSE_YES_NO"; accepted: boolean }) => void;
  onClearError: () => void;
};

export function CommandPanel({
  pendingChoice,
  isSubmitting,
  error,
  onPassPriority,
  onConcede,
  onMakeChoice,
  onClearError
}: CommandPanelProps) {
  const canRenderYesNo = pendingChoice?.type === "CHOOSE_YES_NO";

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
          {canRenderYesNo ? (
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
