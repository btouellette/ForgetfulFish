import type { CardDefinition } from "./cardDefinition";

export const mindBendCardDefinition: CardDefinition = {
  id: "mind-bend",
  name: "Mind Bend",
  manaCost: { blue: 1 },
  rulesText:
    "Change the text of target permanent by replacing one basic land type word with another.",
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
      kind: "choose_mode",
      prompt: "Choose a basic land type word to replace",
      storeKey: "mind-bend:from-land-type",
      modeSource: { kind: "target_land_types", target: "first_object_target" }
    },
    {
      kind: "choose_mode",
      prompt: "Choose the new basic land type word",
      storeKey: "mind-bend:to-land-type",
      modeSource: {
        kind: "basic_land_types",
        excludeStoreKey: "mind-bend:from-land-type"
      }
    },
    {
      kind: "add_text_change_effect_to_target",
      target: "first_object_target",
      duration: "permanent",
      fromKey: "mind-bend:from-land-type",
      toKey: "mind-bend:to-land-type"
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
