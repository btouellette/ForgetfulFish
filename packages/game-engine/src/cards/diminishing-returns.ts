import type { CardDefinition } from "./cardDefinition";

export const diminishingReturnsCardDefinition: CardDefinition = {
  id: "diminishing-returns",
  name: "Diminishing Returns",
  manaCost: { blue: 2, generic: 2 },
  rulesText:
    "Each player shuffles their hand and graveyard into their library. Exile the top ten cards of your library. Each player draws up to seven cards.",
  typeLine: ["Sorcery"],
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
      kind: "for_each_player",
      order: "apnap",
      body: {
        kind: "sequence",
        children: [
          {
            kind: "move_zone_contents",
            fromZone: "hand",
            toZone: "library",
            player: "iteration_player"
          },
          {
            kind: "move_zone_contents",
            fromZone: "graveyard",
            toZone: "library",
            player: "iteration_player"
          },
          { kind: "shuffle_zone", zone: "library", player: "iteration_player" }
        ]
      }
    },
    { kind: "exile_from_library_top", count: 10, player: "controller" },
    { kind: "each_player_draws", countPerPlayer: 7 }
  ],
  continuousEffects: [],
  replacementEffects: []
};
