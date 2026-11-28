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
  onResolve: [
    { kind: "draw_cards", count: 3, player: "controller" },
    {
      kind: "choose_cards",
      from: { kind: "zone", zone: "hand", player: "controller" },
      min: 2,
      max: 2,
      prompt: "Choose 2 cards to put back on top of your library",
      storeKey: "brainstorm:selected"
    },
    {
      kind: "order_cards",
      cards: { kind: "stored", storeKey: "brainstorm:selected" },
      prompt: "Order the chosen cards to put back on top",
      storeKey: "brainstorm:ordered"
    },
    {
      kind: "move_cards",
      cards: { kind: "stored", storeKey: "brainstorm:ordered" },
      to: "library",
      placement: "top"
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
