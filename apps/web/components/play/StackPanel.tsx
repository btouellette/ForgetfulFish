import React from "react";
import type { GameplayCommand, PlayerGameView } from "@forgetful-fish/realtime-contract";

import { buildDisambiguatedObjectLabels } from "./cardLabels";
import styles from "./StackPanel.module.css";

export type ObjectTarget =
  Extract<GameplayCommand, { type: "CAST_SPELL" }> extends {
    targets?: infer T;
  }
    ? Extract<T extends Array<infer U> ? U : never, { kind: "object" }>
    : never;

type StackPanelProps = {
  stack: PlayerGameView["stack"];
  objectPool: PlayerGameView["objectPool"];
  viewerHasPriority: boolean;
  isSubmitting: boolean;
  targetingCardLabel: string | null;
  onSelectStackTarget: (target: ObjectTarget) => void;
  onCancelTargetSelection: () => void;
};

export function StackPanel({
  stack,
  objectPool,
  viewerHasPriority,
  isSubmitting,
  targetingCardLabel,
  onSelectStackTarget,
  onCancelTargetSelection
}: StackPanelProps) {
  const isTargeting = targetingCardLabel !== null;
  const areTargetActionsDisabled = isSubmitting || !viewerHasPriority;
  const stackLabels = React.useMemo(
    () =>
      buildDisambiguatedObjectLabels(
        stack.map((stackItem) => stackItem.object.id),
        objectPool
      ),
    [objectPool, stack]
  );

  return (
    <section className={styles.stackPanel}>
      <h3>Stack</h3>
      {stack.length === 0 ? <p>The stack is empty.</p> : null}
      {isTargeting ? (
        <div className={styles.targetBanner}>
          <span>{`Select a stack spell for ${targetingCardLabel}.`}</span>
          <button
            type="button"
            data-testid="cancel-target-selection"
            disabled={isSubmitting}
            onClick={onCancelTargetSelection}
          >
            Cancel target
          </button>
        </div>
      ) : null}
      <div className={styles.stackList}>
        {stack.map((stackItem) => (
          <div key={`${stackItem.object.id}:${stackItem.object.zcc}`} className={styles.stackRow}>
            <div className={styles.stackMeta}>
              <strong data-testid={`stack-label-${stackItem.object.id}`}>
                {stackLabels[stackItem.object.id] ?? stackItem.object.id}
              </strong>
              <span>{`Controller: ${stackItem.controller}`}</span>
            </div>
            {isTargeting ? (
              <button
                type="button"
                data-testid={`stack-target-${stackItem.object.id}`}
                disabled={areTargetActionsDisabled}
                onClick={() => {
                  if (areTargetActionsDisabled) {
                    return;
                  }

                  onSelectStackTarget({
                    kind: "object",
                    object: stackItem.object
                  });
                }}
              >
                Target this spell
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
