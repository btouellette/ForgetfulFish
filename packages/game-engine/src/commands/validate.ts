import type { PlayLandCommand } from "./command";
import type { GameState } from "../state/gameState";
import type { PlayerId } from "../state/objectRef";
import { zoneKey } from "../state/zones";

function isMainPhase(state: Readonly<GameState>): boolean {
  return state.turnState.phase === "MAIN_1" || state.turnState.phase === "MAIN_2";
}

function playerHandContains(
  state: Readonly<GameState>,
  playerId: PlayerId,
  cardId: string
): boolean {
  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const hand = state.zones.get(zoneKey(handZone)) ?? [];
  return hand.includes(cardId);
}

export function validatePlayLand(
  state: Readonly<GameState>,
  command: PlayLandCommand,
  playerId: PlayerId
): void {
  if (!playerHandContains(state, playerId, command.cardId)) {
    throw new Error("card must be in the hand of the player with priority");
  }

  if (state.turnState.landPlayedThisTurn) {
    throw new Error("already played a land this turn");
  }

  if (!isMainPhase(state)) {
    throw new Error("can only play a land during a main phase");
  }

  if (state.stack.length > 0) {
    throw new Error("cannot play a land while stack is not empty");
  }

  if (state.turnState.priorityState.playerWithPriority !== playerId) {
    throw new Error("cannot play a land without priority");
  }
}
