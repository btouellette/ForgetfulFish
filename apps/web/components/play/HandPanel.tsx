import React from "react";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import styles from "./HandPanel.module.css";

type HandPanelProps = {
  hand: PlayerGameView["viewer"]["hand"];
  isSubmitting: boolean;
  onPlayLand: (cardId: string) => void;
  onCastSpell: (cardId: string) => void;
  onBeginTargetedCast: (cardId: string) => void;
};

const cardsRequiringTargetSelection = new Set(["memory-lapse"]);

function canCastFromHandWithoutTargetPicker(cardDefId: string) {
  return !cardsRequiringTargetSelection.has(cardDefId);
}

export function HandPanel({
  hand,
  isSubmitting,
  onPlayLand,
  onCastSpell,
  onBeginTargetedCast
}: HandPanelProps) {
  return (
    <section className={styles.handPanel}>
      <h3>Hand</h3>
      {hand.length === 0 ? <p>No cards in hand.</p> : null}
      {hand.map((card) => {
        const isLand = card.cardDefId === "island";
        const canCastWithoutTargetPicker = canCastFromHandWithoutTargetPicker(card.cardDefId);

        return (
          <div key={card.id} className={styles.cardRow}>
            <div className={styles.cardMeta}>
              <strong>{card.cardDefId}</strong>
              <span>{card.id}</span>
            </div>
            <div className={styles.actions}>
              {isLand ? (
                <button
                  type="button"
                  data-testid={`play-land-${card.id}`}
                  onClick={() => onPlayLand(card.id)}
                  disabled={isSubmitting}
                >
                  Play land
                </button>
              ) : canCastWithoutTargetPicker ? (
                <button
                  type="button"
                  data-testid={`cast-spell-${card.id}`}
                  onClick={() => onCastSpell(card.id)}
                  disabled={isSubmitting}
                >
                  Cast spell
                </button>
              ) : (
                <button
                  type="button"
                  data-testid={`cast-spell-targeted-${card.id}`}
                  onClick={() => onBeginTargetedCast(card.id)}
                  disabled={isSubmitting}
                >
                  Pick target
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
