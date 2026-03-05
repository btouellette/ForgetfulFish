import { cardRegistry } from "../cards";
import type {
  ActivateAbilityCommand,
  CastSpellCommand,
  ChoicePayload,
  Command,
  PlayLandCommand
} from "./command";
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

export type ValidatedActivateAbility = {
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

export function validateActivateAbility(
  state: Readonly<GameState>,
  command: ActivateAbilityCommand
): ValidatedActivateAbility {
  const playerId = state.turnState.priorityState.playerWithPriority;

  const sourceObject = state.objectPool.get(command.sourceId);
  if (sourceObject === undefined) {
    throw new Error("ability source must exist in the game state");
  }

  if (sourceObject.controller !== playerId) {
    throw new Error("can only activate abilities of permanents you control");
  }

  if (sourceObject.zone.kind !== "battlefield") {
    throw new Error("can only activate abilities of permanents on the battlefield");
  }

  const cardDefinition = cardRegistry.get(sourceObject.cardDefId);
  if (cardDefinition === undefined) {
    throw new Error(`missing card definition '${sourceObject.cardDefId}'`);
  }

  const ability = cardDefinition.activatedAbilities[command.abilityIndex];
  if (ability === undefined) {
    throw new Error("ability index is out of range for the source permanent");
  }

  if (!ability.isManaAbility || ability.effect.kind !== "add_mana") {
    throw new Error("only mana abilities are supported");
  }

  if (!cardDefinition.typeLine.includes("Land")) {
    throw new Error("only land mana abilities are supported");
  }

  const hasTapCost = ability.cost.some((costEntry) => costEntry.kind === "tap");
  if (!hasTapCost || ability.cost.length !== 1) {
    throw new Error("only single tap-cost mana abilities are supported");
  }

  if (sourceObject.tapped) {
    throw new Error("permanent is already tapped");
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
  } catch (error) {
    if (error instanceof Error && EXPECTED_PLAY_LAND_ERRORS.has(error.message)) {
      return false;
    }
    throw error;
  }
}

function isExpectedValidationError(
  error: unknown,
  expectedMessages: ReadonlySet<string>,
  expectedPrefixes: readonly string[] = []
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (expectedMessages.has(error.message)) {
    return true;
  }

  return expectedPrefixes.some((prefix) => error.message.startsWith(prefix));
}

function canCastSpell(state: Readonly<GameState>, command: CastSpellCommand): boolean {
  try {
    validateCastSpell(state, command);
    return true;
  } catch (error) {
    if (
      isExpectedValidationError(
        error,
        EXPECTED_CAST_SPELL_ERRORS,
        EXPECTED_CAST_SPELL_ERROR_PREFIXES
      )
    ) {
      return false;
    }
    throw error;
  }
}

function canActivateAbility(state: Readonly<GameState>, command: ActivateAbilityCommand): boolean {
  try {
    validateActivateAbility(state, command);
    return true;
  } catch (error) {
    if (
      isExpectedValidationError(
        error,
        EXPECTED_ACTIVATE_ABILITY_ERRORS,
        EXPECTED_ACTIVATE_ABILITY_ERROR_PREFIXES
      )
    ) {
      return false;
    }
    throw error;
  }
}

const EXPECTED_PLAY_LAND_ERRORS = new Set([
  "card must be in the hand of the player with priority",
  "card must exist in the game state",
  "card must be a land to be played as a land",
  "already played a land this turn",
  "can only play a land during a main phase",
  "can only play a land during your own turn",
  "cannot play a land while stack is not empty"
]);

const EXPECTED_CAST_SPELL_ERRORS = new Set([
  "card must be in the hand of the player with priority",
  "card must exist in the game state",
  "lands cannot be cast as spells",
  "insufficient mana to cast spell"
]);

const EXPECTED_CAST_SPELL_ERROR_PREFIXES = ["missing card definition '"];

const EXPECTED_ACTIVATE_ABILITY_ERRORS = new Set([
  "ability source must exist in the game state",
  "can only activate abilities of permanents you control",
  "can only activate abilities of permanents on the battlefield",
  "ability index is out of range for the source permanent",
  "only mana abilities are supported",
  "only land mana abilities are supported",
  "only single tap-cost mana abilities are supported",
  "permanent is already tapped"
]);

const EXPECTED_ACTIVATE_ABILITY_ERROR_PREFIXES = ["missing card definition '"];

function defaultPayloadForPendingChoice(choiceType: string): ChoicePayload {
  switch (choiceType) {
    case "CHOOSE_YES_NO":
      return { type: "CHOOSE_YES_NO", accepted: true };
    case "CHOOSE_CARDS":
      return { type: "CHOOSE_CARDS", selected: [], min: 0, max: 0 };
    case "ORDER_CARDS":
      return { type: "ORDER_CARDS", ordered: [] };
    case "NAME_CARD":
      return { type: "NAME_CARD", cardName: "" };
    case "CHOOSE_REPLACEMENT":
      return { type: "CHOOSE_REPLACEMENT", replacementId: "" };
    case "CHOOSE_MODE":
      return { type: "CHOOSE_MODE", mode: { id: "" } };
    case "CHOOSE_TARGET":
      return { type: "CHOOSE_TARGET", target: { kind: "player", playerId: "" } };
    case "ORDER_TRIGGERS":
      return { type: "ORDER_TRIGGERS", triggerIds: [] };
    default:
      return { type: "CHOOSE_YES_NO", accepted: true };
  }
}

function legalChoiceCommands(state: Readonly<GameState>): Command[] {
  if (state.pendingChoice === null) {
    return [];
  }

  if (state.pendingChoice.type === "CHOOSE_YES_NO") {
    return [
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_YES_NO", accepted: true }
      },
      {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_YES_NO", accepted: false }
      }
    ];
  }

  return [
    {
      type: "MAKE_CHOICE",
      payload: defaultPayloadForPendingChoice(state.pendingChoice.type)
    }
  ];
}

export function getLegalCommands(state: Readonly<GameState>): Command[] {
  if (state.pendingChoice !== null) {
    return legalChoiceCommands(state);
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

  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];
  for (const sourceId of battlefield) {
    const sourceObject = state.objectPool.get(sourceId);
    if (sourceObject === undefined || sourceObject.controller !== playerId) {
      continue;
    }

    const sourceDefinition = cardRegistry.get(sourceObject.cardDefId);
    if (sourceDefinition === undefined || sourceDefinition.activatedAbilities.length === 0) {
      continue;
    }

    for (
      let abilityIndex = 0;
      abilityIndex < sourceDefinition.activatedAbilities.length;
      abilityIndex += 1
    ) {
      const activateAbilityCommand: ActivateAbilityCommand = {
        type: "ACTIVATE_ABILITY",
        sourceId,
        abilityIndex,
        targets: []
      };
      if (canActivateAbility(state, activateAbilityCommand)) {
        commands.push(activateAbilityCommand);
      }
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
