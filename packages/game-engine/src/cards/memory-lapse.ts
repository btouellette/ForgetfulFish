import type { CardDefinition } from "./cardDefinition";

export const memoryLapseCardDefinition: CardDefinition = {
  id: "memory-lapse",
  name: "Memory Lapse",
  manaCost: { blue: 1, generic: 1 },
  rulesText:
    "Counter target spell. If that spell is countered this way, put it on top of its owner's library instead of into that player's graveyard.",
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
  onResolve: [{ id: "COUNTER_SPELL", destination: "library-top" }],
  continuousEffects: [],
  replacementEffects: []
};
