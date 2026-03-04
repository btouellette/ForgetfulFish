import type { CardDefinition } from "./cardDefinition";

export const islandCardDefinition: CardDefinition = {
  id: "island",
  name: "Island",
  manaCost: {},
  typeLine: ["Land"],
  subtypes: [{ kind: "basic_land_type", value: "Island" }],
  color: [],
  supertypes: ["Basic"],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [
    {
      kind: "activated",
      cost: [{ kind: "tap" }],
      effect: { kind: "add_mana", mana: { blue: 1 } },
      isManaAbility: true
    }
  ],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};
