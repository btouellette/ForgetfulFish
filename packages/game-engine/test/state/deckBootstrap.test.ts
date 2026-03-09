import { describe, expect, it } from "vitest";

import { getLegalCommands } from "../../src/commands/validate";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import {
  createUniformDeckDefinition,
  createInitialGameStateFromDecks
} from "../../src/state/deckBootstrap";
import { serializeGameState } from "../../src/state/serialization";
import { zoneKey } from "../../src/state/zones";

describe("state/deckBootstrap", () => {
  it("builds objectPool and shared library from deck definitions", () => {
    const state = createInitialGameStateFromDecks("p1", "p2", {
      id: "deck-bootstrap-structure",
      rngSeed: "seed-structure",
      decks: {
        playerOne: {
          cards: [{ cardDefId: "island", count: 3 }]
        },
        playerTwo: {
          cards: [{ cardDefId: "memory-lapse", count: 2 }]
        }
      },
      shuffleLibraries: false
    });

    const library = state.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];
    expect(library).toHaveLength(5);
    expect(state.objectPool.size).toBe(5);
  });

  it("is deterministic for fixed seed and deck definitions", () => {
    const options = {
      id: "deck-bootstrap-deterministic",
      rngSeed: "seed-deterministic",
      decks: {
        playerOne: {
          cards: [
            { cardDefId: "island", count: 8 },
            { cardDefId: "predict", count: 2 }
          ]
        },
        playerTwo: {
          cards: [
            { cardDefId: "island", count: 8 },
            { cardDefId: "memory-lapse", count: 2 }
          ]
        }
      },
      openingDrawCount: 3
    } as const;

    const first = createInitialGameStateFromDecks("p1", "p2", options);
    const second = createInitialGameStateFromDecks("p1", "p2", options);

    expect(serializeGameState(first)).toEqual(serializeGameState(second));
  });

  it("advances rngSeed when bootstrap shuffles libraries", () => {
    const shuffled = createInitialGameStateFromDecks("p1", "p2", {
      id: "deck-bootstrap-rng-advanced",
      rngSeed: "seed-rng-advanced",
      decks: {
        playerOne: {
          cards: [{ cardDefId: "island", count: 3 }]
        },
        playerTwo: {
          cards: [{ cardDefId: "island", count: 3 }]
        }
      },
      shuffleLibraries: true
    });

    const notShuffled = createInitialGameStateFromDecks("p1", "p2", {
      id: "deck-bootstrap-rng-not-advanced",
      rngSeed: "seed-rng-advanced",
      decks: {
        playerOne: {
          cards: [{ cardDefId: "island", count: 3 }]
        },
        playerTwo: {
          cards: [{ cardDefId: "island", count: 3 }]
        }
      },
      shuffleLibraries: false
    });

    expect(shuffled.rngSeed).not.toBe("seed-rng-advanced");
    expect(notShuffled.rngSeed).toBe("seed-rng-advanced");
  });

  it("supports command-driven smoke flow without direct state mutations", () => {
    const state = createInitialGameStateFromDecks("p1", "p2", {
      id: "deck-bootstrap-smoke",
      rngSeed: "seed-smoke",
      decks: {
        playerOne: createUniformDeckDefinition("island", 20),
        playerTwo: createUniformDeckDefinition("island", 20)
      },
      openingDrawCount: 1
    });

    const legal = getLegalCommands(state);
    expect(legal.length).toBeGreaterThan(0);

    const firstPass = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
    const secondPass = processCommand(
      firstPass.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(firstPass.nextState.rngSeed)
    );

    expect(secondPass.nextState.version).toBeGreaterThan(state.version);
  });
});
