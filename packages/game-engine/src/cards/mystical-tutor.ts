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
  onResolve: [
    { id: "SEARCH_LIBRARY_SHUFFLE_TOP", typeFilter: ["Instant", "Sorcery"], min: 0, max: 1 }
  ],
  continuousEffects: [],
  replacementEffects: []
};
