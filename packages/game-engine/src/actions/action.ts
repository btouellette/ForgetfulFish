import type { ManaPool } from "../state/gameState";
import type { ObjectId, ObjectRef, PlayerId } from "../state/objectRef";
import type { ZoneRef } from "../state/zones";

export type ActionId = string;
export type ReplacementId = string;

export const ACTION_TYPES = [
  "DRAW",
  "MOVE_ZONE",
  "DEAL_DAMAGE",
  "COUNTER",
  "SET_CONTROL",
  "DESTROY",
  "TAP",
  "UNTAP",
  "ADD_MANA",
  "LOSE_LIFE",
  "GAIN_LIFE",
  "CREATE_TOKEN",
  "SHUFFLE"
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export type ActionTarget =
  | { kind: "object"; object: ObjectRef }
  | { kind: "player"; playerId: PlayerId };

export interface GameActionBase {
  id: ActionId;
  type: ActionType;
  source: ObjectRef | null;
  controller: PlayerId;
  appliedReplacements: ReplacementId[];
}

export interface DrawAction extends GameActionBase {
  type: "DRAW";
  playerId: PlayerId;
  count: number;
}

export interface MoveZoneAction extends GameActionBase {
  type: "MOVE_ZONE";
  objectId: ObjectId;
  from: ZoneRef;
  to: ZoneRef;
  toIndex?: number;
}

export interface DealDamageAction extends GameActionBase {
  type: "DEAL_DAMAGE";
  amount: number;
  target: ActionTarget;
}

export interface CounterAction extends GameActionBase {
  type: "COUNTER";
  object: ObjectRef;
  destination?: ZoneRef;
  toIndex?: number;
}

export interface SetControlAction extends GameActionBase {
  type: "SET_CONTROL";
  objectId: ObjectId;
  to: PlayerId;
}

export interface DestroyAction extends GameActionBase {
  type: "DESTROY";
  objectId: ObjectId;
}

export interface TapAction extends GameActionBase {
  type: "TAP";
  objectId: ObjectId;
}

export interface UntapAction extends GameActionBase {
  type: "UNTAP";
  objectId: ObjectId;
}

export type ManaDelta = Partial<ManaPool>;

export interface AddManaAction extends GameActionBase {
  type: "ADD_MANA";
  playerId: PlayerId;
  mana: ManaDelta;
}

export interface LoseLifeAction extends GameActionBase {
  type: "LOSE_LIFE";
  playerId: PlayerId;
  amount: number;
}

export interface GainLifeAction extends GameActionBase {
  type: "GAIN_LIFE";
  playerId: PlayerId;
  amount: number;
}

export interface CreateTokenAction extends GameActionBase {
  type: "CREATE_TOKEN";
  tokenDefId: string;
  zone: ZoneRef;
}

export interface ShuffleAction extends GameActionBase {
  type: "SHUFFLE";
  zone: ZoneRef;
}

export type GameAction =
  | DrawAction
  | MoveZoneAction
  | DealDamageAction
  | CounterAction
  | SetControlAction
  | DestroyAction
  | TapAction
  | UntapAction
  | AddManaAction
  | LoseLifeAction
  | GainLifeAction
  | CreateTokenAction
  | ShuffleAction;
