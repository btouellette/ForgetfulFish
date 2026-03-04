import type { GameState } from "../../src/state/gameState";

export function assertStateInvariants(state: GameState): void {
  for (const [, objectIds] of state.zones) {
    for (const objectId of objectIds) {
      if (!state.objectPool.has(objectId)) {
        throw new Error(`zone object '${objectId}' missing from objectPool`);
      }
    }
  }

  for (const player of state.players) {
    for (const objectId of player.hand) {
      if (!state.objectPool.has(objectId)) {
        throw new Error(`hand object '${objectId}' missing from objectPool`);
      }
    }
  }
}
