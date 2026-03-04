import type {
  ContinuousEffect,
  GameState,
  PendingChoice,
  PlayerInfo,
  StackItem,
  TriggeredAbility,
  TurnState
} from "./gameState";
import type { GameObject, GameObjectBase, GameObjectView } from "./gameObject";
import type { LKISnapshot } from "./lki";
import type { ObjectId } from "./objectRef";
import type { ZoneKey, ZoneRef } from "./zones";
import type { GameMode } from "../mode/gameMode";
import { SharedDeckMode } from "../mode/sharedDeck";

type NumberMap = Record<string, number>;
type ZoneCollection = Record<ZoneKey, ObjectId[]>;

export type ModeRegistry = Record<string, GameMode>;

const defaultModeRegistry: ModeRegistry = {
  [SharedDeckMode.id]: SharedDeckMode
};

export type SerializedGameObjectBase = Omit<GameObjectBase, "counters"> & {
  counters: NumberMap;
};

export type SerializedGameObjectView = Omit<GameObjectView, "counters"> & {
  counters: NumberMap;
};

export type SerializedGameObject = Omit<GameObject, "counters"> & {
  counters: NumberMap;
};

export type SerializedLKISnapshot = {
  ref: LKISnapshot["ref"];
  zone: LKISnapshot["zone"];
  base: SerializedGameObjectBase;
  derived: SerializedGameObjectView;
};

export type SerializedGameState = {
  id: string;
  version: number;
  engineVersion: string;
  rngSeed: string;
  modeId: string;
  players: [PlayerInfo, PlayerInfo];
  zones: ZoneCollection;
  zoneCatalog: ZoneRef[];
  objectPool: Record<ObjectId, SerializedGameObject>;
  stack: StackItem[];
  turnState: TurnState;
  continuousEffects: ContinuousEffect[];
  pendingChoice: PendingChoice | null;
  lkiStore: Record<string, SerializedLKISnapshot>;
  triggerQueue: TriggeredAbility[];
};

function numberMapToRecord(value: Map<string, number>): NumberMap {
  const record: NumberMap = {};

  for (const [key, mapValue] of value.entries()) {
    record[key] = mapValue;
  }

  return record;
}

function recordToNumberMap(value: NumberMap): Map<string, number> {
  const map = new Map<string, number>();

  for (const [key, mapValue] of Object.entries(value)) {
    map.set(key, mapValue);
  }

  return map;
}

function serializeGameObject(gameObject: GameObject): SerializedGameObject {
  return {
    ...gameObject,
    counters: numberMapToRecord(gameObject.counters)
  };
}

function deserializeGameObject(gameObject: SerializedGameObject): GameObject {
  return {
    ...gameObject,
    counters: recordToNumberMap(gameObject.counters)
  };
}

function serializeSnapshot(snapshot: LKISnapshot): SerializedLKISnapshot {
  return {
    ref: snapshot.ref,
    zone: snapshot.zone,
    base: {
      ...snapshot.base,
      counters: numberMapToRecord(snapshot.base.counters)
    },
    derived: {
      ...snapshot.derived,
      counters: numberMapToRecord(snapshot.derived.counters)
    }
  };
}

function deserializeSnapshot(snapshot: SerializedLKISnapshot): LKISnapshot {
  return {
    ref: snapshot.ref,
    zone: snapshot.zone,
    base: {
      ...snapshot.base,
      counters: recordToNumberMap(snapshot.base.counters)
    },
    derived: {
      ...snapshot.derived,
      counters: recordToNumberMap(snapshot.derived.counters)
    }
  };
}

function mapToRecord<V>(value: Map<string, V>): Record<string, V> {
  const record: Record<string, V> = {};

  for (const [key, mapValue] of value.entries()) {
    record[key] = mapValue;
  }

  return record;
}

function recordToMap<V>(value: Record<string, V>): Map<string, V> {
  const map = new Map<string, V>();

  for (const [key, mapValue] of Object.entries(value)) {
    map.set(key, mapValue);
  }

  return map;
}

export function serializeGameState(state: GameState): SerializedGameState {
  const serializedObjectPool: Record<ObjectId, SerializedGameObject> = {};
  const serializedLkiStore: Record<string, SerializedLKISnapshot> = {};

  for (const [objectId, gameObject] of state.objectPool.entries()) {
    serializedObjectPool[objectId] = serializeGameObject(gameObject);
  }

  for (const [key, snapshot] of state.lkiStore.entries()) {
    serializedLkiStore[key] = serializeSnapshot(snapshot);
  }

  return {
    id: state.id,
    version: state.version,
    engineVersion: state.engineVersion,
    rngSeed: state.rngSeed,
    modeId: state.mode.id,
    players: state.players,
    zones: mapToRecord(state.zones),
    zoneCatalog: state.zoneCatalog,
    objectPool: serializedObjectPool,
    stack: state.stack,
    turnState: state.turnState,
    continuousEffects: state.continuousEffects,
    pendingChoice: state.pendingChoice,
    lkiStore: serializedLkiStore,
    triggerQueue: state.triggerQueue
  };
}

export function deserializeGameState(
  serialized: SerializedGameState,
  modeRegistry: ModeRegistry = defaultModeRegistry
): GameState {
  const objectPool = new Map<ObjectId, GameObject>();
  const lkiStore = new Map<string, LKISnapshot>();
  const mode = modeRegistry[serialized.modeId];

  if (!mode) {
    throw new Error(`unsupported game mode '${serialized.modeId}'`);
  }

  for (const [objectId, gameObject] of Object.entries(serialized.objectPool)) {
    objectPool.set(objectId as ObjectId, deserializeGameObject(gameObject));
  }

  for (const [key, snapshot] of Object.entries(serialized.lkiStore)) {
    lkiStore.set(key, deserializeSnapshot(snapshot));
  }

  return {
    id: serialized.id,
    version: serialized.version,
    engineVersion: serialized.engineVersion,
    rngSeed: serialized.rngSeed,
    mode,
    players: serialized.players,
    zones: recordToMap(serialized.zones),
    zoneCatalog: serialized.zoneCatalog,
    objectPool,
    stack: serialized.stack,
    turnState: serialized.turnState,
    continuousEffects: serialized.continuousEffects,
    pendingChoice: serialized.pendingChoice,
    lkiStore,
    triggerQueue: serialized.triggerQueue
  };
}

export function serializeGameStateForPersistence(state: GameState): SerializedGameState {
  return serializeGameState(state);
}

export function deserializeGameStateFromPersistence(
  value: SerializedGameState,
  modeRegistry?: ModeRegistry
): GameState {
  return deserializeGameState(value, modeRegistry);
}
