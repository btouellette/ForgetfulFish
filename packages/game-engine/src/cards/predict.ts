import type { CardDefinition } from "./cardDefinition";

export const predictCardDefinition: CardDefinition = {
  id: "predict",
  name: "Predict",
  manaCost: { blue: 1, generic: 1 },
  rulesText:
    "Name a card, then put the top two cards of your library into your graveyard. If that card was named this way, draw two cards. Otherwise, draw a card.",
  typeLine: ["Instant"],
  subtypes: [],
  color: ["blue"],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [
    {
      kind: "name_card",
      prompt: "Name a card",
      storeKey: "predict:named-card"
    },
    {
      kind: "mill_cards",
      count: 2,
      player: "target_player_or_controller",
      storeKey: "predict:milled"
    },
    {
      kind: "draw_by_named_hit",
      namedCardKey: "predict:named-card",
      milledCardsKey: "predict:milled",
      hitCount: 2,
      missCount: 1
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
