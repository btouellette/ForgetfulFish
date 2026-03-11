import type { GameObject } from "../state/gameObject";
import type { GameState, PlayerInfo } from "../state/gameState";
import type { ObjectId, PlayerId } from "../state/objectRef";
import { zoneKey, type ZoneRef } from "../state/zones";
import type { GameObjectView, PlayerGameView, ZoneView } from "./types";

function createRecord<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

function countersToRecord(counters: ReadonlyMap<string, number>): Record<string, number> {
  const record = createRecord<number>();

  for (const [counter, value] of counters.entries()) {
    record[counter] = value;
  }

  return record;
}

function toGameObjectView(object: Readonly<GameObject>): GameObjectView {
  const { abilities: _abilities, counters, ...rest } = object;

  return {
    ...rest,
    counters: countersToRecord(counters)
  };
}

function isViewerHand(zone: Readonly<ZoneRef>, viewerPlayerId: PlayerId): boolean {
  return zone.kind === "hand" && zone.scope === "player" && zone.playerId === viewerPlayerId;
}

function isVisibleZone(zone: Readonly<ZoneRef>, viewerPlayerId: PlayerId): boolean {
  return zone.kind !== "library" && (zone.kind !== "hand" || isViewerHand(zone, viewerPlayerId));
}

function projectZone(
  zone: Readonly<ZoneRef>,
  objectIds: ObjectId[],
  viewerPlayerId: PlayerId
): ZoneView {
  if (zone.kind === "library") {
    return { zoneRef: zone, count: objectIds.length };
  }

  if (zone.kind === "hand" && !isViewerHand(zone, viewerPlayerId)) {
    return { zoneRef: zone, count: objectIds.length };
  }

  return {
    zoneRef: zone,
    objectIds: [...objectIds],
    count: objectIds.length
  };
}

function getPlayer(state: Readonly<GameState>, playerId: PlayerId): PlayerInfo {
  const player = state.players.find((entry) => entry.id === playerId);

  if (!player) {
    throw new Error(`player '${playerId}' is not part of state '${state.id}'`);
  }

  return player;
}

function getOpponent(state: Readonly<GameState>, viewerPlayerId: PlayerId): PlayerInfo {
  const opponent = state.players.find((entry) => entry.id !== viewerPlayerId);

  if (!opponent) {
    throw new Error(`opponent for player '${viewerPlayerId}' is missing from state '${state.id}'`);
  }

  return opponent;
}

function requireObject(state: Readonly<GameState>, objectId: ObjectId): GameObject {
  const object = state.objectPool.get(objectId);

  if (!object) {
    throw new Error(`object '${objectId}' is missing from state '${state.id}'`);
  }

  return object;
}

export function projectPlayerView(
  state: Readonly<GameState>,
  viewerPlayerId: PlayerId
): PlayerGameView {
  const viewer = getPlayer(state, viewerPlayerId);
  const opponent = getOpponent(state, viewerPlayerId);
  const objectPool = createRecord<GameObjectView>() as Record<ObjectId, GameObjectView>;

  for (const [objectId, object] of state.objectPool.entries()) {
    if (isVisibleZone(object.zone, viewerPlayerId)) {
      objectPool[objectId] = toGameObjectView(object);
    }
  }

  return {
    viewerPlayerId,
    stateVersion: state.version,
    turnState: {
      phase: state.turnState.phase,
      activePlayerId: state.turnState.activePlayerId,
      priorityPlayerId: state.turnState.priorityState.playerWithPriority
    },
    viewer: {
      id: viewer.id,
      life: viewer.life,
      manaPool: { ...viewer.manaPool },
      hand: viewer.hand.map((objectId) => toGameObjectView(requireObject(state, objectId))),
      handCount: viewer.hand.length
    },
    opponent: {
      id: opponent.id,
      life: opponent.life,
      manaPool: { ...opponent.manaPool },
      handCount: opponent.hand.length
    },
    zones: state.zoneCatalog.map((zone) =>
      projectZone(zone, state.zones.get(zoneKey(zone)) ?? [], viewerPlayerId)
    ),
    objectPool,
    stack: state.stack.map((item) => ({ object: item.object, controller: item.controller })),
    pendingChoice: state.pendingChoice?.forPlayer === viewerPlayerId ? state.pendingChoice : null
  };
}
