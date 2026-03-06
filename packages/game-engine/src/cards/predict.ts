import type { CardDefinition } from "./cardDefinition";

export const predictCardDefinition: CardDefinition = {
  id: "predict",
  name: "Predict",
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
  onResolve: [{ id: "PREDICT" }],
  continuousEffects: [],
  replacementEffects: []
};
