import React from "react";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import styles from "./HandPanel.module.css";

type HandPanelProps = {
  hand: PlayerGameView["viewer"]["hand"];
  legalActions: PlayerGameView["legalActions"]["hand"];
  viewerHasPriority: boolean;
  isSubmitting: boolean;
  onPlayLand: (cardId: string) => void;
  onCastSpell: (cardId: string) => void;
  onBeginTargetedCast: (cardId: string) => void;
};

export function HandPanel({
  hand,
  legalActions,
  viewerHasPriority,
  isSubmitting,
  onPlayLand,
  onCastSpell,
  onBeginTargetedCast
}: HandPanelProps) {
  const areHandActionsDisabled = isSubmitting || !viewerHasPriority;

  return (
    <section className={styles.handPanel}>
      <h3>Hand</h3>
      {hand.length === 0 ? <p>No cards in hand.</p> : null}
      {hand.map((card) => {
        const cardActions = legalActions[card.id] ?? [];
        const playLandAction = cardActions.find((action) => action.type === "PLAY_LAND");
        const castSpellAction = cardActions.find((action) => action.type === "CAST_SPELL");

        return (
          <div key={card.id} className={styles.cardRow}>
            <div className={styles.cardMeta}>
              <strong>{card.cardDefId}</strong>
              <span>{card.id}</span>
            </div>
            <div className={styles.actions}>
              {playLandAction ? (
                <button
                  type="button"
                  data-testid={`play-land-${card.id}`}
                  onClick={() => {
                    if (areHandActionsDisabled) {
                      return;
                    }

                    onPlayLand(card.id);
                  }}
                  disabled={areHandActionsDisabled}
                >
                  Play land
                </button>
              ) : castSpellAction && !castSpellAction.requiresTargets ? (
                <button
                  type="button"
                  data-testid={`cast-spell-${card.id}`}
                  onClick={() => {
                    if (areHandActionsDisabled) {
                      return;
                    }

                    onCastSpell(card.id);
                  }}
                  disabled={areHandActionsDisabled}
                >
                  Cast spell
                </button>
              ) : castSpellAction ? (
                <button
                  type="button"
                  data-testid={`cast-spell-targeted-${card.id}`}
                  onClick={() => {
                    if (areHandActionsDisabled) {
                      return;
                    }

                    onBeginTargetedCast(card.id);
                  }}
                  disabled={areHandActionsDisabled}
                >
                  Pick target
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
