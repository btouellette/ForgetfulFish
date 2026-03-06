import type { CardDefinition } from "./cardDefinition";

export const memoryLapseCardDefinition: CardDefinition = {
  id: "memory-lapse",
  name: "Memory Lapse",
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
  onResolve: [{ id: "COUNTER" }, { id: "MOVE_ZONE" }],
  continuousEffects: [],
  replacementEffects: []
};
