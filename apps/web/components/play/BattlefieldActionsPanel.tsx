import React from "react";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import styles from "./BattlefieldActionsPanel.module.css";

type BattlefieldActionsPanelProps = {
  legalActions: PlayerGameView["legalActions"]["battlefield"];
  objectPool: PlayerGameView["objectPool"];
  viewerHasPriority: boolean;
  isSubmitting: boolean;
  onActivateAbility: (sourceId: string, abilityIndex: number) => void;
};

export function BattlefieldActionsPanel({
  legalActions,
  objectPool,
  viewerHasPriority,
  isSubmitting,
  onActivateAbility
}: BattlefieldActionsPanelProps) {
  const sourceEntries = Object.entries(legalActions).filter(([, actions]) => actions.length > 0);

  return (
    <section className={styles.panel}>
      <h3>Battlefield actions</h3>
      {sourceEntries.length === 0 ? <p>No battlefield actions available.</p> : null}
      {sourceEntries.map(([sourceId, actions]) => {
        const objectView = objectPool[sourceId];
        const label = objectView?.cardDefId ?? sourceId;

        return (
          <div key={sourceId} className={styles.sourceRow}>
            <div className={styles.sourceMeta}>
              <strong>{label}</strong>
              <span>{sourceId}</span>
            </div>
            <div className={styles.actionList}>
              {actions.map((action) => (
                <button
                  key={`${sourceId}:${action.commandBase.abilityIndex}`}
                  type="button"
                  data-testid={`activate-ability-${sourceId}-${action.commandBase.abilityIndex}`}
                  disabled={isSubmitting || !viewerHasPriority}
                  onClick={() => {
                    if (isSubmitting || !viewerHasPriority) {
                      return;
                    }

                    onActivateAbility(sourceId, action.commandBase.abilityIndex);
                  }}
                >
                  {action.requiresTargets ? "Activate ability (pick target)" : "Activate ability"}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
