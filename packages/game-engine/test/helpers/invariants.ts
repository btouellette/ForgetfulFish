import type { GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";

export function assertStateInvariants(state: GameState): void {
  const zoneLocations = new Map<string, string[]>();

  for (const [, objectIds] of state.zones) {
    for (const objectId of objectIds) {
      if (!state.objectPool.has(objectId)) {
        throw new Error(`zone object '${objectId}' missing from objectPool`);
      }

      const existing = zoneLocations.get(objectId) ?? [];
      zoneLocations.set(objectId, existing);
    }
  }

  for (const [zone, objectIds] of state.zones) {
    for (const objectId of objectIds) {
      const existing = zoneLocations.get(objectId) ?? [];
      if (!existing.includes(zone)) {
        existing.push(zone);
        zoneLocations.set(objectId, existing);
      }
    }
  }

  for (const [objectId, locations] of zoneLocations) {
    if (locations.length > 1) {
      throw new Error(`duplicate object id '${objectId}' across zones: ${locations.join(", ")}`);
    }
  }

  for (const [objectId, object] of state.objectPool) {
    const locations = zoneLocations.get(objectId);
    if (!locations || locations.length === 0) {
      throw new Error(`object '${objectId}' in objectPool is not assigned to any zone`);
    }

    const expectedZoneKey = zoneKey(object.zone);
    if (!locations.includes(expectedZoneKey)) {
      throw new Error(
        `object '${objectId}' zone mismatch: expected '${expectedZoneKey}', found '${locations.join(",")}'`
      );
    }
  }

  for (const [index, player] of state.players.entries()) {
    for (const objectId of player.hand) {
      if (!state.objectPool.has(objectId)) {
        throw new Error(`hand object '${objectId}' missing from objectPool`);
      }
    }

    const handZone = state.zones.get(
      zoneKey({ kind: "hand", scope: "player", playerId: player.id })
    );
    const handZoneLength = handZone?.length ?? 0;
    if (player.hand.length !== handZoneLength) {
      throw new Error(
        `player ${index + 1} hand count mismatch: player.hand=${player.hand.length}, handZone=${handZoneLength}`
      );
    }

    const manaValues = Object.values(player.manaPool);
    if (manaValues.some((value) => value < 0)) {
      throw new Error(`player '${player.id}' has negative mana`);
    }

    if (!Number.isInteger(player.life)) {
      throw new Error(`player '${player.id}' life total must be an integer`);
    }
  }
}
