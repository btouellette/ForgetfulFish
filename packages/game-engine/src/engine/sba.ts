import { cardRegistry } from "../cards";
import type { StaticAbilityAst } from "../cards/abilityAst";
import { removeAsLongAsEffects, removeSourceGoneEffects } from "../effects/continuous/duration";
import { computeGameObject } from "../effects/continuous/layers";
import { createEvent, type GameEvent } from "../events/event";
import type { GameState } from "../state/gameState";
import { type ObjectId, type PlayerId } from "../state/objectRef";
import { bumpZcc, type ZoneRef, zoneKey } from "../state/zones";

export type SBAResult =
  | { type: "DESTROY_ZERO_TOUGHNESS"; objectId: ObjectId }
  | { type: "SACRIFICE_WHEN_NO_LAND_TYPE"; objectId: ObjectId; landType: string }
  | { type: "PLAYER_LOSES"; playerId: PlayerId; reason: string };

export function checkSBAs(state: Readonly<GameState>): SBAResult[] {
  const results: SBAResult[] = [];

  for (const [objectId, object] of state.objectPool) {
    if (object.zone.kind !== "battlefield") {
      continue;
    }

    const cardDefinition = cardRegistry.get(object.cardDefId);
    if (cardDefinition === undefined || !cardDefinition.typeLine.includes("Creature")) {
      continue;
    }

    const computedObject = computeGameObject(objectId, state);
    const toughness = computedObject.toughness;
    if (toughness === null) {
      continue;
    }

    if (toughness <= 0) {
      results.push({ type: "DESTROY_ZERO_TOUGHNESS", objectId });
    }

    const sacrificeAbility = computedObject.abilities.find(
      (
        ability
      ): ability is Extract<StaticAbilityAst, { staticKind: "when_no_islands_sacrifice" }> =>
        ability.kind === "static" && ability.staticKind === "when_no_islands_sacrifice"
    );
    if (
      sacrificeAbility !== undefined &&
      !controllerControlsLandType(state, computedObject.controller, sacrificeAbility.landType)
    ) {
      results.push({
        type: "SACRIFICE_WHEN_NO_LAND_TYPE",
        objectId,
        landType: sacrificeAbility.landType
      });
    }
  }

  for (const player of state.players) {
    if (player.hasLost) {
      continue;
    }

    if (player.life <= 0) {
      results.push({ type: "PLAYER_LOSES", playerId: player.id, reason: "life_0_or_less" });
      continue;
    }

    if (player.attemptedDrawFromEmptyLibrary) {
      results.push({
        type: "PLAYER_LOSES",
        playerId: player.id,
        reason: "draw_from_empty_library"
      });
    }
  }

  return results;
}

export function applySBAs(
  state: Readonly<GameState>,
  sbas: SBAResult[]
): { state: GameState; events: GameEvent[] } {
  if (sbas.length === 0) {
    return { state: { ...state }, events: [] };
  }

  const destroySet = new Set(
    sbas
      .filter(
        (sba): sba is Extract<SBAResult, { objectId: ObjectId }> =>
          sba.type === "DESTROY_ZERO_TOUGHNESS" || sba.type === "SACRIFICE_WHEN_NO_LAND_TYPE"
      )
      .map((sba) => sba.objectId)
  );
  const lossEntries = sbas.filter((sba) => sba.type === "PLAYER_LOSES");
  const lossMap = new Map<PlayerId, string>();
  for (const loss of lossEntries) {
    if (!lossMap.has(loss.playerId)) {
      lossMap.set(loss.playerId, loss.reason);
    }
  }

  const nextObjectPool = new Map(state.objectPool);
  const nextZones = new Map(state.zones);
  const zoneChanges: Array<{
    objectId: ObjectId;
    oldZcc: number;
    newZcc: number;
    from: ZoneRef;
    to: ZoneRef;
    toIndex: number;
  }> = [];

  for (const objectId of destroySet) {
    const object = state.objectPool.get(objectId);
    if (object === undefined || object.zone.kind !== "battlefield") {
      continue;
    }

    const fromZone = object.zone;
    const toZone = state.mode.resolveZone(state, "graveyard", object.owner);
    const fromKey = zoneKey(fromZone);
    const toKey = zoneKey(toZone);
    const fromObjects = nextZones.get(fromKey) ?? [];
    const toObjects = nextZones.get(toKey) ?? [];

    nextZones.set(
      fromKey,
      fromObjects.filter((id) => id !== objectId)
    );

    const movedObject = bumpZcc({
      ...object,
      zone: toZone
    });
    nextObjectPool.set(objectId, movedObject);
    nextZones.set(toKey, [...toObjects, objectId]);

    zoneChanges.push({
      objectId,
      oldZcc: object.zcc,
      newZcc: movedObject.zcc,
      from: fromZone,
      to: toZone,
      toIndex: toObjects.length
    });
  }

  const nextPlayers: GameState["players"] = [
    {
      ...state.players[0],
      hasLost: state.players[0].hasLost || lossMap.has(state.players[0].id)
    },
    {
      ...state.players[1],
      hasLost: state.players[1].hasLost || lossMap.has(state.players[1].id)
    }
  ];

  const totalSbaEvents = zoneChanges.length + lossMap.size;
  const firstSeq = state.version + 1;
  const lastSeq = totalSbaEvents === 0 ? firstSeq : state.version + totalSbaEvents;

  const nextState: GameState = {
    ...state,
    version: lastSeq,
    players: nextPlayers,
    zones: nextZones,
    objectPool: nextObjectPool
  };

  const events: GameEvent[] = [];
  let seq = firstSeq;

  for (const zoneChange of zoneChanges) {
    events.push(
      createEvent(
        {
          engineVersion: state.engineVersion,
          schemaVersion: 1,
          gameId: state.id
        },
        seq,
        {
          type: "ZONE_CHANGE",
          objectId: zoneChange.objectId,
          oldZcc: zoneChange.oldZcc,
          newZcc: zoneChange.newZcc,
          from: zoneChange.from,
          to: zoneChange.to,
          toIndex: zoneChange.toIndex
        }
      )
    );
    seq += 1;
  }

  for (const [playerId, reason] of lossMap) {
    events.push(
      createEvent(
        {
          engineVersion: state.engineVersion,
          schemaVersion: 1,
          gameId: state.id
        },
        seq,
        {
          type: "PLAYER_LOST",
          playerId,
          reason
        }
      )
    );
    seq += 1;
  }

  return {
    state: nextState,
    events
  };
}

function controllerControlsLandType(
  state: Readonly<GameState>,
  playerId: PlayerId,
  landType: Extract<StaticAbilityAst, { staticKind: "when_no_islands_sacrifice" }>["landType"]
): boolean {
  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];

  return battlefield.some((objectId) => {
    const object = computeGameObject(objectId, state);
    if (object === undefined || object.controller !== playerId) {
      return false;
    }

    const definition = cardRegistry.get(object.cardDefId);
    if (definition === undefined) {
      return false;
    }

    return definition.subtypes.some(
      (subtype) => subtype.kind === "basic_land_type" && subtype.value === landType
    );
  });
}

export function runSBALoop(state: Readonly<GameState>): { state: GameState; events: GameEvent[] } {
  let currentState: GameState = { ...state };
  const allEvents: GameEvent[] = [];

  for (let iteration = 0; iteration < 20; iteration += 1) {
    const sbas = checkSBAs(currentState);
    const sourceCleanup = removeSourceGoneEffects(currentState);
    const asLongAsCleanup = removeAsLongAsEffects(sourceCleanup.state);
    if (sbas.length === 0) {
      if (sourceCleanup.events.length === 0 && asLongAsCleanup.events.length === 0) {
        return { state: currentState, events: allEvents };
      }

      currentState = asLongAsCleanup.state;
      allEvents.push(...sourceCleanup.events, ...asLongAsCleanup.events);
      continue;
    }

    const applied = applySBAs(currentState, sbas);
    const postSbaSourceCleanup = removeSourceGoneEffects(applied.state);
    const postSbaAsLongAsCleanup = removeAsLongAsEffects(postSbaSourceCleanup.state);
    currentState = postSbaAsLongAsCleanup.state;
    allEvents.push(
      ...applied.events,
      ...postSbaSourceCleanup.events,
      ...postSbaAsLongAsCleanup.events
    );
  }

  throw new Error("SBA loop did not converge within 20 iterations");
}
