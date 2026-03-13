import React from "react";
import type { GameplayCommand, PlayerGameView } from "@forgetful-fish/realtime-contract";

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
  isSubmitting: boolean;
  targetingCardLabel: string | null;
  onSelectStackTarget: (target: ObjectTarget) => void;
  onCancelTargetSelection: () => void;
};

function formatStackLabel(
  stackItem: PlayerGameView["stack"][number],
  objectPool: PlayerGameView["objectPool"]
) {
  const objectView = objectPool[stackItem.object.id];
  const cardName = objectView?.cardDefId ?? "unknown-spell";
  return `${cardName} (${stackItem.object.id})`;
}

export function StackPanel({
  stack,
  objectPool,
  isSubmitting,
  targetingCardLabel,
  onSelectStackTarget,
  onCancelTargetSelection
}: StackPanelProps) {
  const isTargeting = targetingCardLabel !== null;

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
                {formatStackLabel(stackItem, objectPool)}
              </strong>
              <span>{`Controller: ${stackItem.controller}`}</span>
            </div>
            {isTargeting ? (
              <button
                type="button"
                data-testid={`stack-target-${stackItem.object.id}`}
                disabled={isSubmitting}
                onClick={() =>
                  onSelectStackTarget({
                    kind: "object",
                    object: stackItem.object
                  })
                }
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
