import type { GameObject } from "./gameObject";
import type { PlayerId } from "./objectRef";

export type ZoneKind = "library" | "graveyard" | "battlefield" | "exile" | "stack" | "hand";

export type ZoneScope = { scope: "shared" } | { scope: "player"; playerId: PlayerId };

export type ZoneRef = { kind: ZoneKind } & ZoneScope;

export type ZoneKey = string;

export function zoneKey(zone: ZoneRef): ZoneKey {
  if (zone.scope === "shared") {
    return `shared:${zone.kind}`;
  }

  return `player:${zone.playerId}:${zone.kind}`;
}

export function bumpZcc(obj: GameObject): GameObject {
  return {
    ...obj,
    zcc: obj.zcc + 1
  };
}
