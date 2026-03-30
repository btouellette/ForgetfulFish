import type { CardDefinition } from "./cardDefinition";

export const brainstormCardDefinition: CardDefinition = {
  id: "brainstorm",
  name: "Brainstorm",
  manaCost: { blue: 1 },
  rulesText:
    "Draw three cards, then put two cards from your hand on top of your library in any order.",
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
  onResolve: [{ id: "DRAW_CHOOSE_RETURN", drawAmount: 3, returnAmount: 2 }],
  continuousEffects: [],
  replacementEffects: []
};
