import { cardRegistry } from "../cards";
import type { GameEvent } from "./event";
import type { GameState, TriggeredAbility } from "../state/gameState";

function nextVersionedId(id: string, version: number): string {
  const baseId = id.replace(/@v\d+$/, "");
  return `${baseId}@v${version}`;
}

function collectTriggeredAbilities(
  state: Readonly<GameState>,
  events: readonly GameEvent[]
): TriggeredAbility[] {
  const queued: TriggeredAbility[] = [];

  for (const event of events) {
    for (const object of state.objectPool.values()) {
      if (object.zone.kind !== "battlefield") {
        continue;
      }

      const card = cardRegistry.get(object.cardDefId);
      if (card === undefined || card.triggeredAbilities.length === 0) {
        continue;
      }

      card.triggeredAbilities.forEach((trigger, triggerIndex) => {
        if (trigger.event !== event.type) {
          return;
        }

        queued.push({
          id: `${object.id}:${trigger.event}:${event.seq}:${triggerIndex}`
        });
      });
    }
  }

  return queued;
}

export function emitEvents(state: Readonly<GameState>, events: readonly GameEvent[]): GameState {
  if (events.length === 0) {
    return { ...state };
  }

  const queued = collectTriggeredAbilities(state, events);
  const version = state.version + events.length;

  return {
    ...state,
    id: nextVersionedId(state.id, version),
    version,
    triggerQueue: [...state.triggerQueue, ...queued]
  };
}
