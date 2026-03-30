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
    { id: "NAME_MILL_DRAW_ON_HIT", millAmount: 2, drawOnHitAmount: 2, missDrawAmount: 1 }
  ],
  continuousEffects: [],
  replacementEffects: []
};
