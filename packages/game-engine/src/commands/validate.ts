import { cardRegistry } from "../cards";
import type { PlayLandCommand } from "./command";
import type { GameState } from "../state/gameState";
import { zoneKey } from "../state/zones";

function isMainPhase(state: Readonly<GameState>): boolean {
  return state.turnState.phase === "MAIN_1" || state.turnState.phase === "MAIN_2";
}

function playerHandContains(state: Readonly<GameState>, playerId: string, cardId: string): boolean {
  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const hand = state.zones.get(zoneKey(handZone)) ?? [];
  return hand.includes(cardId);
}

export function validatePlayLand(state: Readonly<GameState>, command: PlayLandCommand): void {
  const playerId = state.turnState.priorityState.playerWithPriority;

  if (!playerHandContains(state, playerId, command.cardId)) {
    throw new Error("card must be in the hand of the player with priority");
  }

  const cardObject = state.objectPool.get(command.cardId);
  if (cardObject === undefined) {
    throw new Error("card must exist in the game state");
  }

  const cardDefinition = cardRegistry.get(cardObject.cardDefId);
  const isLandCard = cardDefinition?.typeLine.includes("Land") ?? false;
  if (!isLandCard) {
    throw new Error("card must be a land to be played as a land");
  }

  if (state.turnState.landPlayedThisTurn) {
    throw new Error("already played a land this turn");
  }

  if (!isMainPhase(state)) {
    throw new Error("can only play a land during a main phase");
  }

  if (state.turnState.activePlayerId !== playerId) {
    throw new Error("can only play a land during your own turn");
  }

  if (state.stack.length > 0) {
    throw new Error("cannot play a land while stack is not empty");
  }
}
