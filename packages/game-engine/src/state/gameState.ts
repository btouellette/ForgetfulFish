import type { GameObject } from "./gameObject";
import type { LKISnapshot } from "./lki";
import type { ObjectId, PlayerId } from "./objectRef";
import { createInitialPriorityState, type PriorityState } from "./priorityState";
import type { GameMode } from "../mode/gameMode";
import { SharedDeckMode } from "../mode/sharedDeck";
import type { PendingChoice } from "../choices/pendingChoice";
import type { StackItem } from "../stack/stackItem";
import type { ZoneKey, ZoneRef } from "./zones";

export type { StackItem } from "../stack/stackItem";
export type { PendingChoice } from "../choices/pendingChoice";

export type ManaPool = {
  white: number;
  blue: number;
  black: number;
  red: number;
  green: number;
  colorless: number;
};

export type PlayerInfo = {
  id: PlayerId;
  life: number;
  manaPool: ManaPool;
  hand: ObjectId[];
  priority: boolean;
  hasLost: boolean;
  attemptedDrawFromEmptyLibrary: boolean;
};

export type TurnPhase =
  | "UNTAP"
  | "UPKEEP"
  | "DRAW"
  | "MAIN_1"
  | "BEGIN_COMBAT"
  | "DECLARE_ATTACKERS"
  | "DECLARE_BLOCKERS"
  | "COMBAT_DAMAGE"
  | "END_COMBAT"
  | "MAIN_2"
  | "END"
  | "CLEANUP";

export type TurnStep = TurnPhase;

export type TurnState = {
  activePlayerId: PlayerId;
  phase: TurnPhase;
  step: TurnStep;
  priorityState: PriorityState;
  attackers: ObjectId[];
  blockers: Array<{ attackerId: ObjectId; blockerId: ObjectId }>;
  landPlayedThisTurn: boolean;
};

export type ContinuousEffect = {
  id: string;
  duration?: "until_end_of_turn";
};

export type TriggeredAbility = {
  id: string;
};

export type GameState = {
  id: string;
  version: number;
  engineVersion: string;
  rngSeed: string;
  mode: GameMode;
  players: [PlayerInfo, PlayerInfo];
  zones: Map<ZoneKey, ObjectId[]>;
  zoneCatalog: ZoneRef[];
  objectPool: Map<ObjectId, GameObject>;
  stack: StackItem[];
  turnState: TurnState;
  continuousEffects: ContinuousEffect[];
  pendingChoice: PendingChoice | null;
  lkiStore: Map<string, LKISnapshot>;
  triggerQueue: TriggeredAbility[];
};

export type CreateInitialGameStateOptions = {
  id: string;
  rngSeed: string;
  mode?: GameMode;
};

function createPlayer(id: PlayerId, hasPriority: boolean): PlayerInfo {
  return {
    id,
    life: 20,
    manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
    hand: [],
    priority: hasPriority,
    hasLost: false,
    attemptedDrawFromEmptyLibrary: false
  };
}

export function createInitialGameState(
  playerOneId: PlayerId,
  playerTwoId: PlayerId,
  options: CreateInitialGameStateOptions
): GameState {
  const mode = options.mode ?? SharedDeckMode;
  const { zoneCatalog, zones } = mode.createInitialZones([playerOneId, playerTwoId]);

  return {
    id: options.id,
    version: 1,
    engineVersion: "0.1.0",
    rngSeed: options.rngSeed,
    mode,
    players: [createPlayer(playerOneId, true), createPlayer(playerTwoId, false)],
    zones,
    zoneCatalog,
    objectPool: new Map(),
    stack: [],
    turnState: {
      activePlayerId: playerOneId,
      phase: "UNTAP",
      step: "UNTAP",
      priorityState: createInitialPriorityState(playerOneId),
      attackers: [],
      blockers: [],
      landPlayedThisTurn: false
    },
    continuousEffects: [],
    pendingChoice: null,
    lkiStore: new Map(),
    triggerQueue: []
  };
}
