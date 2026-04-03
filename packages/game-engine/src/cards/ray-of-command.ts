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
  onResolve: [
    { kind: "set_control_of_target", target: "first_object_target", duration: "until_end_of_turn" },
    { kind: "untap_target", target: "first_object_target" },
    {
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: 6,
      duration: "until_end_of_turn",
      effect: { kind: "grant_keyword", payload: { keyword: "haste" } }
    },
    {
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: 6,
      duration: "until_end_of_turn",
      effect: { kind: "must_attack" }
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
