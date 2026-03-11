import type { PendingChoice } from "../choices/pendingChoice";
import type { GameObject } from "../state/gameObject";
import type { ManaPool, TurnPhase } from "../state/gameState";
import type { ObjectId, ObjectRef, PlayerId } from "../state/objectRef";
import type { ZoneRef } from "../state/zones";

export type GameObjectView = Omit<GameObject, "abilities" | "counters"> & {
  counters: Record<string, number>;
};

export type PlayerView = {
  id: PlayerId;
  life: number;
  manaPool: ManaPool;
  hand: GameObjectView[];
  handCount: number;
};

export type OpponentView = {
  id: PlayerId;
  life: number;
  manaPool: ManaPool;
  handCount: number;
};

export type ZoneView = {
  zoneRef: ZoneRef;
  objectIds?: ObjectId[];
  count: number;
};

export type StackItemView = {
  object: ObjectRef;
  controller: PlayerId;
};

export type PlayerTurnStateView = {
  phase: TurnPhase;
  activePlayerId: PlayerId;
  priorityPlayerId: PlayerId;
};

export type PlayerGameView = {
  viewerPlayerId: PlayerId;
  stateVersion: number;
  turnState: PlayerTurnStateView;
  viewer: PlayerView;
  opponent: OpponentView;
  zones: ZoneView[];
  objectPool: Record<ObjectId, GameObjectView>;
  stack: StackItemView[];
  pendingChoice: PendingChoice | null;
};
