import type { AbilityAst } from "../cards/abilityAst";
import type { ObjectId, PlayerId } from "./objectRef";
import type { ZoneRef } from "./zones";

export type GameObjectBase = {
  id: ObjectId;
  zcc: number;
  cardDefId: string;
  owner: PlayerId;
  controller: PlayerId;
  counters: Map<string, number>;
  damage: number;
  tapped: boolean;
  summoningSick: boolean;
  attachments: ObjectId[];
  abilities: AbilityAst[];
  zone: ZoneRef;
};

export type DerivedGameObjectView = GameObjectBase & {
  power: number | null;
  toughness: number | null;
};

export type GameObject = GameObjectBase;
