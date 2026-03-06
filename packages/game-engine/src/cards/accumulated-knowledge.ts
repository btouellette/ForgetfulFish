import type { CardDefinition } from "./cardDefinition";

export const accumulatedKnowledgeCardDefinition: CardDefinition = {
  id: "accumulated-knowledge",
  name: "Accumulated Knowledge",
  manaCost: { blue: 1, generic: 1 },
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
  onResolve: [{ id: "DRAW_BY_GRAVEYARD_COPY_COUNT", bonus: 1 }],
  continuousEffects: [],
  replacementEffects: []
};
