import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../src/state";

describe("createInitialGameState", () => {
  it("starts both players at 20 life and active player set", () => {
    const state = createInitialGameState("player-1", "player-2");

    expect(state.players).toEqual([
      { playerId: "player-1", life: 20 },
      { playerId: "player-2", life: 20 }
    ]);
    expect(state.activePlayerId).toBe("player-1");
  });
});
