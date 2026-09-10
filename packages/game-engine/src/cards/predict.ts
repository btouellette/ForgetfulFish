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
      kind: "conditional",
      if: {
        kind: "named_card_among",
        nameKey: "predict:named-card",
        cardsKey: "predict:milled"
      },
      then: { kind: "draw_cards", count: 2, player: "controller" },
      else: { kind: "draw_cards", count: 1, player: "controller" }
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
