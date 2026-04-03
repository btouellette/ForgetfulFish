import type { CardDefinition } from "./cardDefinition";

export const mysticalTutorCardDefinition: CardDefinition = {
  id: "mystical-tutor",
  name: "Mystical Tutor",
  manaCost: { blue: 1 },
  rulesText:
    "Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.",
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
      kind: "choose_cards",
      zone: "library",
      player: "controller",
      min: 0,
      max: 1,
      prompt: "Choose up to one Instant or Sorcery card",
      storeKey: "mystical-tutor:selected",
      typeFilter: ["Instant", "Sorcery"]
    },
    {
      kind: "shuffle_zone",
      zone: "library",
      player: "controller",
      topCardFromKey: "mystical-tutor:selected"
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
