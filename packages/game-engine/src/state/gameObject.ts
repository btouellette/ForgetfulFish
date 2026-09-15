import type { AbilityAst, Color, SubtypeAtom } from "../cards/abilityAst";
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
  /** Phased-out permanents stay in the battlefield zone but are treated as though they don't exist. */
  phasedOut?: boolean;
  attachments: ObjectId[];
  abilities: AbilityAst[];
  zone: ZoneRef;
};

export type DerivedGameObjectView = GameObjectBase & {
  color: Color[];
  typeLine: string[];
  subtypes: SubtypeAtom[];
  power: number | null;
  toughness: number | null;
};

export type GameObject = GameObjectBase;
