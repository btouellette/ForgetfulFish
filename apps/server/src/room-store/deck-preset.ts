import type { DeckDefinition } from "@forgetful-fish/game-engine";

const MIXED_DECK_CARDS = [
  { cardDefId: "island", count: 14 },
  { cardDefId: "brainstorm", count: 1 },
  { cardDefId: "predict", count: 1 },
  { cardDefId: "memory-lapse", count: 1 },
  { cardDefId: "mystical-tutor", count: 1 },
  { cardDefId: "accumulated-knowledge", count: 2 }
] as const;

export function createGameplayDeckPreset(): DeckDefinition {
  return {
    cards: MIXED_DECK_CARDS
  };
}
