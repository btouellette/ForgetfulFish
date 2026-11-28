import type { CardDefinition } from "./cardDefinition";

export const diminishingReturnsCardDefinition: CardDefinition = {
  id: "diminishing-returns",
  name: "Diminishing Returns",
  manaCost: { blue: 2, generic: 2 },
  rulesText:
    "Each player shuffles their hand and graveyard into their library. You exile the top ten cards of your library. Then each player draws up to seven cards.",
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
      effects: [
        {
          kind: "move_cards",
          cards: { kind: "zone", zone: "hand", player: "iterated_player" },
          to: "library"
        },
        {
          kind: "move_cards",
          cards: { kind: "zone", zone: "graveyard", player: "iterated_player" },
          to: "library"
        },
        { kind: "shuffle_zone", zone: "library", player: "iterated_player" }
      ]
    },
    {
      kind: "move_cards",
      cards: { kind: "top_of_library", player: "controller", count: 10 },
      to: "exile"
    },
    { kind: "each_player_draws", count: 7 }
  ],
  continuousEffects: [],
  replacementEffects: []
};
