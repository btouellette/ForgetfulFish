import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../../src/state/gameState";
import { givePriority, handlePassPriority } from "../../src/engine/kernel";

describe("state/priorityState", () => {
  it("active player passes and gives priority to non-active player", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-1",
      rngSeed: "seed-priority-1"
    });

    const result = handlePassPriority(state, "p1");

    expect(result).not.toBe("both_passed");

    if (result === "both_passed") {
      throw new Error("expected updated game state");
    }

    expect(result.turnState.priorityState.playerWithPriority).toBe("p2");
    expect(result.turnState.priorityState.activePlayerPassed).toBe(true);
    expect(result.turnState.priorityState.nonActivePlayerPassed).toBe(false);
  });

  it("returns both_passed when active then non-active pass on empty stack", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-2",
      rngSeed: "seed-priority-2"
    });

    const afterActivePass = handlePassPriority(state, "p1");

    if (afterActivePass === "both_passed") {
      throw new Error("expected updated game state after first pass");
    }

    const secondPass = handlePassPriority(afterActivePass, "p2");

    expect(secondPass).toBe("both_passed");
  });

  it("rejects passing priority when player does not currently hold priority", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-3",
      rngSeed: "seed-priority-3"
    });

    expect(() => handlePassPriority(state, "p2")).toThrow(
      "Cannot pass priority without holding priority"
    );
  });

  it("initializes priority holder to active player", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-4",
      rngSeed: "seed-priority-4"
    });

    expect(state.turnState.priorityState.playerWithPriority).toBe("p1");
    expect(state.turnState.priorityState.activePlayerPassed).toBe(false);
    expect(state.turnState.priorityState.nonActivePlayerPassed).toBe(false);
  });

  it("givePriority updates playerWithPriority", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-5",
      rngSeed: "seed-priority-5"
    });

    const nextState = givePriority(state, "p2");

    expect(nextState.turnState.priorityState.playerWithPriority).toBe("p2");
    expect(nextState.players[0].priority).toBe(false);
    expect(nextState.players[1].priority).toBe(true);
  });

  it("throws when giving priority to an unknown player", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-5b",
      rngSeed: "seed-priority-5b"
    });

    expect(() => givePriority(state, "p3")).toThrow("Unknown playerId 'p3'");
  });

  it("passing priority resets the passed flag for the player receiving priority", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-priority-6",
      rngSeed: "seed-priority-6"
    });

    const withBothPassedFlags = {
      ...state,
      turnState: {
        ...state.turnState,
        priorityState: {
          playerWithPriority: "p1",
          activePlayerPassed: true,
          nonActivePlayerPassed: true
        }
      }
    };

    const nextState = givePriority(withBothPassedFlags, "p2");

    expect(nextState.turnState.priorityState.nonActivePlayerPassed).toBe(false);
    expect(nextState.turnState.priorityState.activePlayerPassed).toBe(true);
  });
});
