import { cardRegistry } from "../cards";
import { drawCard } from "../engine/kernel";
import { Rng } from "../rng/rng";
import {
  createInitialGameState,
  type CreateInitialGameStateOptions,
  type GameState
} from "./gameState";
import type { PlayerId } from "./objectRef";
import { zoneKey } from "./zones";

export type DeckCardCount = {
  cardDefId: string;
  count: number;
};

export type DeckDefinition = {
  cards: readonly DeckCardCount[];
};

export type DeckBootstrapOptions = CreateInitialGameStateOptions & {
  decks: {
    playerOne: DeckDefinition;
    playerTwo: DeckDefinition;
  };
  openingDrawCount?: number;
  shuffleLibraries?: boolean;
};

function assertValidCount(cardDefId: string, count: number): void {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`invalid card count '${count}' for '${cardDefId}'`);
  }
}

function assertKnownCardDefinition(cardDefId: string): void {
  if (cardRegistry.has(cardDefId)) {
    return;
  }

  throw new Error(`missing card definition '${cardDefId}'`);
}

function sanitizeCardDefId(cardDefId: string): string {
  return cardDefId.replace(/[^a-zA-Z0-9-]/g, "-");
}

function appendDeckToLibrary(
  state: GameState,
  owner: PlayerId,
  deck: DeckDefinition,
  nextObjectIndex: number
): number {
  const libraryZone = state.mode.resolveZone(state, "library", owner);
  const libraryKey = zoneKey(libraryZone);
  const currentLibrary = state.zones.get(libraryKey) ?? [];
  const appendedLibrary = [...currentLibrary];
  let objectIndex = nextObjectIndex;

  for (const { cardDefId, count } of deck.cards) {
    assertValidCount(cardDefId, count);
    assertKnownCardDefinition(cardDefId);

    for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
      const objectId = `obj-deck-${owner}-${objectIndex}-${sanitizeCardDefId(cardDefId)}`;
      objectIndex += 1;

      state.objectPool.set(objectId, {
        id: objectId,
        zcc: 0,
        cardDefId,
        owner,
        controller: owner,
        counters: new Map(),
        damage: 0,
        tapped: false,
        summoningSick: false,
        attachments: [],
        abilities: [],
        zone: libraryZone
      });
      appendedLibrary.push(objectId);
    }
  }

  state.zones.set(libraryKey, appendedLibrary);
  return objectIndex;
}

export function createInitialGameStateFromDecks(
  playerOneId: PlayerId,
  playerTwoId: PlayerId,
  options: DeckBootstrapOptions
): GameState {
  const openingDrawCount = options.openingDrawCount ?? 0;
  if (!Number.isInteger(openingDrawCount) || openingDrawCount < 0) {
    throw new Error(`invalid openingDrawCount '${openingDrawCount}'`);
  }

  const shuffleLibraries = options.shuffleLibraries ?? true;
  const state = createInitialGameState(playerOneId, playerTwoId, options);
  const playerOrder: [PlayerId, PlayerId] = [playerOneId, playerTwoId];
  let nextObjectIndex = 0;

  nextObjectIndex = appendDeckToLibrary(
    state,
    playerOneId,
    options.decks.playerOne,
    nextObjectIndex
  );
  appendDeckToLibrary(state, playerTwoId, options.decks.playerTwo, nextObjectIndex);

  const rng = new Rng(state.rngSeed);
  const libraryKeys = playerOrder
    .map((playerId) => zoneKey(state.mode.resolveZone(state, "library", playerId)))
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort();

  if (shuffleLibraries) {
    for (const key of libraryKeys) {
      const cards = state.zones.get(key) ?? [];
      state.zones.set(key, rng.shuffle(cards));
    }

    state.rngSeed = rng.getSeed();
  }

  if (openingDrawCount === 0) {
    return state;
  }

  const drawOrder = state.mode.simultaneousDrawOrder(
    openingDrawCount * 2,
    state.turnState.activePlayerId,
    playerOrder
  );

  let currentState = state;
  for (const playerId of drawOrder) {
    currentState = drawCard(currentState, playerId, rng).state;
  }

  return currentState;
}

export function createUniformDeckDefinition(cardDefId: string, count: number): DeckDefinition {
  assertValidCount(cardDefId, count);
  return {
    cards: [{ cardDefId, count }]
  };
}
