import { describe, expect, it } from "vitest";

import type { Command } from "../../src/commands/command";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import { createInitialGameStateFromDecks } from "../../src/state/deckBootstrap";
import { serializeGameState } from "../../src/state/serialization";

type ReplayResult = {
  serializedState: ReturnType<typeof serializeGameState>;
  events: Array<{ type: string; seq: number }>;
};

function runReplayScenario(seed: string): ReplayResult {
  const state = createInitialGameStateFromDecks("p1", "p2", {
    id: "replay-determinism",
    rngSeed: seed,
    decks: {
      playerOne: {
        cards: [
          { cardDefId: "predict", count: 1 },
          { cardDefId: "island", count: 19 }
        ]
      },
      playerTwo: {
        cards: [{ cardDefId: "island", count: 20 }]
      }
    },
    openingDrawCount: 1,
    shuffleLibraries: false
  });

  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = "p1";
  state.players[0].priority = true;
  state.players[1].priority = false;
  state.players[0].manaPool = { ...state.players[0].manaPool, blue: 2 };

  const predictCardId = state.players[0].hand.find((cardId) => {
    return state.objectPool.get(cardId)?.cardDefId === "predict";
  });
  if (predictCardId === undefined) {
    throw new Error("expected Predict in opening hand for replay scenario");
  }

  const commandStream: Command[] = [
    { type: "CAST_SPELL", cardId: predictCardId, targets: [] },
    { type: "PASS_PRIORITY" },
    { type: "PASS_PRIORITY" },
    { type: "MAKE_CHOICE", payload: { type: "NAME_CARD", cardName: "Memory Lapse" } }
  ];

  let currentState = state;
  const events: Array<{ type: string; seq: number }> = [];

  for (const command of commandStream) {
    const result = processCommand(currentState, command, new Rng(currentState.rngSeed));
    currentState = result.nextState;
    events.push(...result.newEvents.map((event) => ({ type: event.type, seq: event.seq })));
  }

  return {
    serializedState: serializeGameState(currentState),
    events
  };
}

describe("integration/replay-determinism", () => {
  it("produces identical state and event stream for same seed plus command/choice stream", () => {
    const first = runReplayScenario("replay-seed");
    const second = runReplayScenario("replay-seed");

    expect(first.serializedState).toEqual(second.serializedState);
    expect(first.events).toEqual(second.events);
  });
});
