import type { CardDefinition } from "./cardDefinition";

export const mysticalTutorCardDefinition: CardDefinition = {
  id: "mystical-tutor",
  name: "Mystical Tutor",
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
  onResolve: [{ id: "MYSTICAL_TUTOR" }],
  continuousEffects: [],
  replacementEffects: []
};
