import type { CardDefinition } from "./cardDefinition";

export const brainstormCardDefinition: CardDefinition = {
  id: "brainstorm",
  name: "Brainstorm",
  manaCost: { blue: 1 },
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
  onResolve: [{ id: "BRAINSTORM" }],
  continuousEffects: [],
  replacementEffects: []
};
