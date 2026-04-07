import type { CardDefinition } from "./cardDefinition";

export const dandanCardDefinition: CardDefinition = {
  id: "dandan",
  name: "Dandan",
  manaCost: { blue: 2 },
  rulesText:
    "Islandwalk. Dandan can't attack unless defending player controls an Island. When you control no Islands, sacrifice Dandan.",
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Fish" }],
  color: ["blue"],
  supertypes: [],
  power: 4,
  toughness: 1,
  keywords: [{ kind: "keyword", keyword: "landwalk", landType: "Island" }],
  staticAbilities: [
    {
      kind: "static",
      staticKind: "cant_attack_unless",
      condition: { kind: "defender_controls_land_type", landType: "Island" }
    },
    {
      kind: "static",
      staticKind: "when_no_islands_sacrifice",
      landType: "Island"
    }
  ],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};
