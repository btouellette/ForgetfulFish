import { cardRegistry } from "../../cards";
import type { ResolveCondition } from "../../cards/resolveEffect";
import type { GameObject } from "../../state/gameObject";

export type ResolveConditionContext = {
  scratch: Readonly<Record<string, unknown>>;
  objectPool: ReadonlyMap<string, GameObject>;
};

function readString(context: ResolveConditionContext, key: string): string | null {
  const stored = context.scratch[key];
  return typeof stored === "string" ? stored : null;
}

function readStringArray(context: ResolveConditionContext, key: string): string[] {
  const stored = context.scratch[key];
  if (!Array.isArray(stored)) {
    return [];
  }

  return stored.filter((value): value is string => typeof value === "string");
}

export function evaluateResolveCondition(
  condition: ResolveCondition,
  context: ResolveConditionContext
): boolean {
  switch (condition.kind) {
    case "named_card_among": {
      const namedCard = readString(context, condition.nameKey);
      if (namedCard === null) {
        throw new Error(`missing named card key '${condition.nameKey}' in scratch state`);
      }

      const namedCardLower = namedCard.trim().toLowerCase();

      return readStringArray(context, condition.cardsKey).some((objectId) => {
        const object = context.objectPool.get(objectId);
        if (object === undefined) {
          return false;
        }

        return cardRegistry.get(object.cardDefId)?.name.toLowerCase() === namedCardLower;
      });
    }
    case "mode_equals":
      return readString(context, condition.storeKey) === condition.modeId;
    case "scratch_present": {
      const stored = context.scratch[condition.key];
      return stored !== undefined && stored !== null && stored !== false;
    }
    default: {
      const exhaustive: never = condition;
      return exhaustive;
    }
  }
}
