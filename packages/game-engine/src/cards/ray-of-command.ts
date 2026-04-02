import type { CardDefinition } from "./cardDefinition";

export const rayOfCommandCardDefinition: CardDefinition = {
  id: "ray-of-command",
  name: "Ray of Command",
  manaCost: { blue: 1, generic: 3 },
  rulesText:
    "Untap target creature and gain control of it until end of turn. That creature gains haste until end of turn. Attack with that creature this turn if able.",
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
  onResolve: [{ id: "GAIN_CONTROL_UNTAP_MUST_ATTACK" }],
  continuousEffects: [],
  replacementEffects: []
};
