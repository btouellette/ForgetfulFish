import type { TriggerDefinitionAst } from "../cards/abilityAst";
import { computeGameObject } from "../effects/continuous/layers";
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

  const getTriggeredAbilities = (objectId: string): TriggerDefinitionAst[] =>
    computeGameObject(objectId, state).abilities.filter(
      (ability): ability is TriggerDefinitionAst => ability.kind === "trigger"
    );

  for (const event of events) {
    for (const object of state.objectPool.values()) {
      if (object.zone.kind !== "battlefield") {
        continue;
      }

      const triggeredAbilities = getTriggeredAbilities(object.id);
      if (triggeredAbilities.length === 0) {
        continue;
      }

      triggeredAbilities.forEach((trigger, triggerIndex) => {
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
  const maxEventSeq = events.reduce(
    (highest, event) => (event.seq > highest ? event.seq : highest),
    state.version
  );

  return {
    ...state,
    id: nextVersionedId(state.id, maxEventSeq),
    version: maxEventSeq,
    triggerQueue: [...state.triggerQueue, ...queued]
  };
}
