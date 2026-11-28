import type { CardDefinition } from "./cardDefinition";

export const visionCharmCardDefinition: CardDefinition = {
  id: "vision-charm",
  name: "Vision Charm",
  manaCost: { blue: 1 },
  rulesText:
    "Choose one — • Target player mills four cards. • Choose a land type and a basic land type. Each land of the first chosen type becomes the second type until end of turn. • Target artifact phases out.",
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
      kind: "modal",
      prompt: "Choose one",
      modes: [
        {
          id: "mill",
          label: "Target player mills four cards.",
          effects: [{ kind: "mill_cards", count: 4, player: "target_player_or_controller" }]
        },
        {
          id: "land-type",
          label:
            "Choose a land type and a basic land type. Each land of the first chosen type becomes the second type until end of turn.",
          effects: [
            {
              kind: "choose_mode",
              prompt: "Choose a land type to change",
              storeKey: "vision-charm:from-land-type",
              modeSource: { kind: "basic_land_types" }
            },
            {
              kind: "choose_mode",
              prompt: "Choose the basic land type those lands become",
              storeKey: "vision-charm:to-land-type",
              modeSource: { kind: "basic_land_types" }
            },
            {
              kind: "add_continuous_effect",
              to: {
                kind: "zone",
                zone: "battlefield",
                player: "all_players",
                filter: {
                  types: ["Land"],
                  landType: { kind: "stored", storeKey: "vision-charm:from-land-type" }
                }
              },
              layer: 4,
              duration: "until_end_of_turn",
              effect: { kind: "become_basic_land_type", landTypeKey: "vision-charm:to-land-type" }
            }
          ]
        },
        {
          id: "phase-out",
          label: "Target artifact phases out.",
          effects: [{ kind: "phase_out_target", target: "first_object_target" }]
        }
      ]
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
