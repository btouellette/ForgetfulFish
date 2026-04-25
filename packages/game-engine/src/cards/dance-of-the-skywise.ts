import type { CardDefinition } from "./cardDefinition";

export const danceOfTheSkywiseCardDefinition: CardDefinition = {
  id: "dance-of-the-skywise",
  name: "Dance of the Skywise",
  manaCost: { blue: 1, generic: 1 },
  rulesText:
    "Until end of turn, target creature you control becomes a blue Dragon Illusion with base power and toughness 4/4, loses all abilities, and gains flying.",
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
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: 4,
      duration: "until_end_of_turn",
      effect: {
        kind: "type_change",
        payload: {
          subtypes: [
            { kind: "creature_type", value: "Dragon" },
            { kind: "creature_type", value: "Illusion" }
          ]
        }
      }
    },
    {
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: 5,
      duration: "until_end_of_turn",
      effect: {
        kind: "set_color",
        payload: { color: ["blue"] }
      }
    },
    {
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: 6,
      duration: "until_end_of_turn",
      effect: { kind: "remove_all_abilities" }
    },
    {
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: 6,
      duration: "until_end_of_turn",
      effect: { kind: "grant_keyword", payload: { keyword: "flying" } }
    },
    {
      kind: "add_continuous_effect_to_target",
      target: "first_object_target",
      layer: "7a",
      duration: "until_end_of_turn",
      effect: { kind: "set_pt", payload: { power: 4, toughness: 4 } }
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
