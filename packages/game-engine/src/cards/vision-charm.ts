import type { CardDefinition } from "./cardDefinition";

export const visionCharmCardDefinition: CardDefinition = {
  id: "vision-charm",
  name: "Vision Charm",
  manaCost: { blue: 1 },
  rulesText:
    "Choose one — Target player puts the top four cards of their library into their graveyard; or target permanent becomes the basic land type of your choice until end of turn.",
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
      prompt: "Choose one",
      storeKey: "vision-charm:mode",
      modeSource: {
        kind: "explicit",
        modes: [
          { id: "mill", label: "Put the top four cards of a library into the graveyard" },
          { id: "land-type", label: "Target permanent becomes a basic land type" }
        ]
      }
    },
    {
      kind: "conditional",
      if: { kind: "mode_equals", storeKey: "vision-charm:mode", modeId: "mill" },
      then: {
        kind: "mill_cards",
        count: 4,
        player: "target_player_or_controller",
        storeKey: "vision-charm:milled"
      },
      else: {
        kind: "sequence",
        children: [
          {
            kind: "choose_mode",
            prompt: "Choose a basic land type",
            storeKey: "vision-charm:land-type",
            modeSource: { kind: "basic_land_types" }
          },
          {
            kind: "add_subtype_from_choice_to_target",
            target: "first_object_target",
            subtypeKey: "vision-charm:land-type",
            duration: "until_end_of_turn"
          }
        ]
      }
    }
  ],
  continuousEffects: [],
  replacementEffects: []
};
