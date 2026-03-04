import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../src/state/gameState";

describe("createInitialGameState", () => {
  it("starts both players at 20 life and sets active player in turnState", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.players).toEqual([
      {
        id: "player-1",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        priority: false
      },
      {
        id: "player-2",
        life: 20,
        manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 },
        hand: [],
        priority: false
      }
    ]);
    expect(state.turnState.activePlayerId).toBe("player-1");
  });
});
