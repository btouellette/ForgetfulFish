import type { CardDefinition } from "./cardDefinition";

export const crystalSprayCardDefinition: CardDefinition = {
  id: "crystal-spray",
  name: "Crystal Spray",
  manaCost: { blue: 1, generic: 2 },
  rulesText:
    "Change one instance of a basic land type word on target permanent until end of turn. Draw a card.",
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
      prompt: "Choose a specific land type word to change",
      storeKey: "crystal-spray:instance",
      selectedLandTypeStoreKey: "crystal-spray:from-land-type",
      modeSource: { kind: "target_land_type_instances", target: "first_object_target" }
    },
    {
      kind: "choose_mode",
      prompt: "Choose the new basic land type word",
      storeKey: "crystal-spray:to-land-type",
      modeSource: { kind: "basic_land_types", excludeStoreKey: "crystal-spray:from-land-type" }
    },
    {
      kind: "add_text_change_effect_to_target",
      target: "first_object_target",
      duration: "until_end_of_turn",
      fromKey: "crystal-spray:from-land-type",
      toKey: "crystal-spray:to-land-type",
      instanceKey: "crystal-spray:instance"
    },
    {
      kind: "draw_cards",
      count: 1,
      player: "controller"
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
