import type { CardDefinition } from "./cardDefinition";

export const accumulatedKnowledgeCardDefinition: CardDefinition = {
  id: "accumulated-knowledge",
  name: "Accumulated Knowledge",
  manaCost: { blue: 1, generic: 1 },
  rulesText:
    "Draw a card, then draw cards equal to the number of cards named Accumulated Knowledge in all graveyards.",
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
      kind: "draw_cards",
      player: "controller",
      count: {
        kind: "sum",
        values: [
          { kind: "literal", value: 1 },
          {
            kind: "count_in_zone",
            zone: "graveyard",
            player: "controller",
            filter: { kind: "same_card_definition_as_source" }
          }
        ]
      }
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
