import type { ManaCost } from "../cards/cardDefinition";
import type { PendingChoice } from "../choices/pendingChoice";
import type { GameObject } from "../state/gameObject";
import type { ManaPool, TurnPhase } from "../state/gameState";
import type { ObjectId, ObjectRef, PlayerId } from "../state/objectRef";
import type { ZoneRef } from "../state/zones";
import type { ManaAmount } from "../cards/abilityAst";

export type ActionModeView = {
  id: string;
  label?: string;
};

export type HandLegalActionView =
  | {
      type: "PLAY_LAND";
      command: { type: "PLAY_LAND"; cardId: ObjectId };
    }
  | {
      type: "CAST_SPELL";
      commandBase: { type: "CAST_SPELL"; cardId: ObjectId };
      requiresTargets: boolean;
      availableModes: ActionModeView[];
    };

export type BattlefieldLegalActionView = {
  type: "ACTIVATE_ABILITY";
  commandBase: {
    type: "ACTIVATE_ABILITY";
    sourceId: ObjectId;
    abilityIndex: number;
  };
  requiresTargets: boolean;
  isManaAbility: boolean;
  manaProduced: ManaAmount | null;
  blocksAutoPass: boolean;
};

export type LegalActionsView = {
  passPriority: { command: { type: "PASS_PRIORITY" } } | null;
  concede: { command: { type: "CONCEDE" } };
  choice: PendingChoice | null;
  hand: Record<ObjectId, HandLegalActionView[]>;
  battlefield: Record<ObjectId, BattlefieldLegalActionView[]>;
  hasOtherBlockingActions: boolean;
};

export type GameObjectView = Omit<GameObject, "abilities" | "counters"> & {
  name?: string;
  manaCost?: ManaCost;
  rulesText?: string;
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
  legalActions: LegalActionsView;
};
