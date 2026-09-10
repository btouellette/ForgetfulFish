import type {
  ResolvePlayerSelector,
  ResolveValue,
  ResolveZoneSelector
} from "../../cards/resolveEffect";
import type { GameObject } from "../../state/gameObject";
import { zoneKey, type ZoneRef } from "../../state/zones";

export type ResolveValueContext = {
  scratch: Readonly<Record<string, unknown>>;
  zones: ReadonlyMap<string, string[]>;
  objectPool: ReadonlyMap<string, GameObject>;
  resolveZone: (zone: ResolveZoneSelector, playerId: string) => ZoneRef;
  resolvePlayer: (player: ResolvePlayerSelector) => string;
  sourceCardDefId: string;
};

function objectsInZone(
  context: ResolveValueContext,
  zone: ResolveZoneSelector,
  player: ResolvePlayerSelector
): GameObject[] {
  const objectIds =
    context.zones.get(zoneKey(context.resolveZone(zone, context.resolvePlayer(player)))) ?? [];

  return objectIds
    .map((objectId) => context.objectPool.get(objectId))
    .filter((object): object is GameObject => object !== undefined);
}

export function evaluateResolveValue(value: ResolveValue, context: ResolveValueContext): number {
  switch (value.kind) {
    case "literal":
      return value.value;
    case "scratch_number": {
      const stored = context.scratch[value.key];
      return typeof stored === "number" ? stored : 0;
    }
    case "zone_size":
      return objectsInZone(context, value.zone, value.player).length;
    case "count_in_zone": {
      const objects = objectsInZone(context, value.zone, value.player);
      if (value.filter === undefined) {
        return objects.length;
      }

      const cardDefId =
        value.filter.kind === "same_card_definition_as_source"
          ? context.sourceCardDefId
          : value.filter.cardDefId;

      return objects.filter((object) => object.cardDefId === cardDefId).length;
    }
    case "sum":
      return value.values.reduce(
        (total, operand) => total + evaluateResolveValue(operand, context),
        0
      );
    case "subtract":
      return evaluateResolveValue(value.left, context) - evaluateResolveValue(value.right, context);
    case "clamp": {
      const evaluated = evaluateResolveValue(value.value, context);
      const lowerBounded = value.min === undefined ? evaluated : Math.max(evaluated, value.min);
      return value.max === undefined ? lowerBounded : Math.min(lowerBounded, value.max);
    }
    default: {
      const exhaustive: never = value;
      return exhaustive;
    }
  }
}
