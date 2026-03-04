import type {
  ContinuousEffect,
  GameMode,
  GameState,
  LKISnapshot,
  PendingChoice,
  PlayerInfo,
  PriorityState,
  StackItem,
  TriggeredAbility,
  TurnState
} from "./gameState";
import type { GameObject, GameObjectBase, GameObjectView } from "./gameObject";
import type { ObjectId, PlayerId } from "./objectRef";
import type { ZoneKey, ZoneRef } from "./zones";

type NumberMap = Record<string, number>;
type ZoneCollection = Record<ZoneKey, ObjectId[]>;

export type SerializedGameObjectBase = Omit<GameObjectBase, "counters"> & {
  counters: NumberMap;
};

export type SerializedGameObjectView = Omit<GameObjectView, "counters"> & {
  counters: NumberMap;
};

export type SerializedGameObject = Omit<GameObject, "counters"> & {
  counters: NumberMap;
};

export type SerializedGameState = {
  id: string;
  version: number;
  engineVersion: string;
  rngSeed: string;
  mode: GameMode;
  players: [PlayerInfo, PlayerInfo];
  zones: ZoneCollection;
  zoneCatalog: ZoneRef[];
  objectPool: Record<ObjectId, SerializedGameObject>;
  stack: StackItem[];
  turnState: TurnState;
  continuousEffects: ContinuousEffect[];
  pendingChoice: PendingChoice | null;
  lkiStore: Record<string, LKISnapshot>;
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

  for (const [objectId, gameObject] of state.objectPool.entries()) {
    serializedObjectPool[objectId] = serializeGameObject(gameObject);
  }

  return {
    id: state.id,
    version: state.version,
    engineVersion: state.engineVersion,
    rngSeed: state.rngSeed,
    mode: state.mode,
    players: state.players,
    zones: mapToRecord(state.zones),
    zoneCatalog: state.zoneCatalog,
    objectPool: serializedObjectPool,
    stack: state.stack,
    turnState: state.turnState,
    continuousEffects: state.continuousEffects,
    pendingChoice: state.pendingChoice,
    lkiStore: mapToRecord(state.lkiStore),
    triggerQueue: state.triggerQueue
  };
}

export function deserializeGameState(serialized: SerializedGameState): GameState {
  const objectPool = new Map<ObjectId, GameObject>();

  for (const [objectId, gameObject] of Object.entries(serialized.objectPool)) {
    objectPool.set(objectId as ObjectId, deserializeGameObject(gameObject));
  }

  return {
    id: serialized.id,
    version: serialized.version,
    engineVersion: serialized.engineVersion,
    rngSeed: serialized.rngSeed,
    mode: serialized.mode,
    players: serialized.players,
    zones: recordToMap(serialized.zones),
    zoneCatalog: serialized.zoneCatalog,
    objectPool,
    stack: serialized.stack,
    turnState: serialized.turnState,
    continuousEffects: serialized.continuousEffects,
    pendingChoice: serialized.pendingChoice,
    lkiStore: recordToMap(serialized.lkiStore),
    triggerQueue: serialized.triggerQueue
  };
}

export function serializeGameStateForPersistence(state: GameState): SerializedGameState {
  return serializeGameState(state);
}

export function deserializeGameStateFromPersistence(value: SerializedGameState): GameState {
  return deserializeGameState(value);
}
