import type { GameObject } from "./gameObject";
import type { ObjectId, PlayerId } from "./objectRef";
import { zoneKey, type ZoneKey, type ZoneRef } from "./zones";

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
};

export type PriorityState = {
  holder: PlayerId;
  passedBy: PlayerId[];
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

export type StackItem = {
  id: string;
};

export type ContinuousEffect = {
  id: string;
};

export type PendingChoice = {
  type: string;
};

export type LKISnapshot = {
  id: string;
};

export type TriggeredAbility = {
  id: string;
};

export type GameMode = {
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

function createPlayer(id: PlayerId): PlayerInfo {
  return {
    id,
    life: 20,
    manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
    hand: [],
    priority: false
  };
}

export function createInitialGameState(playerOneId: PlayerId, playerTwoId: PlayerId): GameState {
  const zoneCatalog: ZoneRef[] = [
    { kind: "library", scope: "shared" },
    { kind: "graveyard", scope: "shared" },
    { kind: "battlefield", scope: "shared" },
    { kind: "exile", scope: "shared" },
    { kind: "stack", scope: "shared" },
    { kind: "hand", scope: "player", playerId: playerOneId },
    { kind: "hand", scope: "player", playerId: playerTwoId }
  ];

  const zones = new Map<ZoneKey, ObjectId[]>();

  for (const zone of zoneCatalog) {
    zones.set(zoneKey(zone), []);
  }

  return {
    id: "game-initial",
    version: 1,
    engineVersion: "0.1.0",
    rngSeed: "seed-initial",
    mode: { id: "shared-deck" },
    players: [createPlayer(playerOneId), createPlayer(playerTwoId)],
    zones,
    zoneCatalog,
    objectPool: new Map(),
    stack: [],
    turnState: {
      activePlayerId: playerOneId,
      phase: "UNTAP",
      step: "UNTAP",
      priorityState: {
        holder: playerOneId,
        passedBy: []
      },
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
