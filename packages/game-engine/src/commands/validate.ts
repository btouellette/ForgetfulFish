import { cardRegistry } from "../cards";
import type { CastSpellCommand, Command, PlayLandCommand } from "./command";
import type { CardDefinition } from "../cards/cardDefinition";
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

export type ValidatedCastSpell = {
  playerId: string;
  cardDefinition: CardDefinition;
};

function hasSufficientMana(
  state: Readonly<GameState>,
  playerId: string,
  cost: CardDefinition["manaCost"]
): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    throw new Error(`unknown player '${playerId}'`);
  }

  return (
    player.manaPool.white >= (cost.white ?? 0) &&
    player.manaPool.blue >= (cost.blue ?? 0) &&
    player.manaPool.black >= (cost.black ?? 0) &&
    player.manaPool.red >= (cost.red ?? 0) &&
    player.manaPool.green >= (cost.green ?? 0) &&
    player.manaPool.colorless >= (cost.colorless ?? 0)
  );
}

export function validateCastSpell(
  state: Readonly<GameState>,
  command: CastSpellCommand
): ValidatedCastSpell {
  const playerId = state.turnState.priorityState.playerWithPriority;

  if (!playerHandContains(state, playerId, command.cardId)) {
    throw new Error("card must be in the hand of the player with priority");
  }

  const cardObject = state.objectPool.get(command.cardId);
  if (cardObject === undefined) {
    throw new Error("card must exist in the game state");
  }

  const cardDefinition = cardRegistry.get(cardObject.cardDefId);
  if (cardDefinition === undefined) {
    throw new Error(`missing card definition '${cardObject.cardDefId}'`);
  }

  if (cardDefinition.typeLine.includes("Land")) {
    throw new Error("lands cannot be cast as spells");
  }

  if (!hasSufficientMana(state, playerId, cardDefinition.manaCost)) {
    throw new Error("insufficient mana to cast spell");
  }

  return {
    playerId,
    cardDefinition
  };
}

function canPlayLand(state: Readonly<GameState>, command: PlayLandCommand): boolean {
  try {
    validatePlayLand(state, command);
    return true;
  } catch {
    return false;
  }
}

function canCastSpell(state: Readonly<GameState>, command: CastSpellCommand): boolean {
  try {
    validateCastSpell(state, command);
    return true;
  } catch {
    return false;
  }
}

export function getLegalCommands(state: Readonly<GameState>): Command[] {
  if (state.pendingChoice !== null) {
    return [
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_YES_NO", accepted: true }
      }
    ];
  }

  const playerId = state.turnState.priorityState.playerWithPriority;
  const commands: Command[] = [{ type: "PASS_PRIORITY" }];

  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const hand = state.zones.get(zoneKey(handZone)) ?? [];

  for (const cardId of hand) {
    const playLandCommand: PlayLandCommand = { type: "PLAY_LAND", cardId };
    if (canPlayLand(state, playLandCommand)) {
      commands.push(playLandCommand);
    }

    const castSpellCommand: CastSpellCommand = { type: "CAST_SPELL", cardId, targets: [] };
    if (canCastSpell(state, castSpellCommand)) {
      commands.push(castSpellCommand);
    }
  }

  if (state.turnState.step === "DECLARE_ATTACKERS" && state.turnState.activePlayerId === playerId) {
    commands.push({ type: "DECLARE_ATTACKERS", attackers: [] });
  }

  if (state.turnState.step === "DECLARE_BLOCKERS" && state.turnState.activePlayerId !== playerId) {
    commands.push({ type: "DECLARE_BLOCKERS", assignments: [] });
  }

  commands.push({ type: "CONCEDE" });
  return commands;
}
