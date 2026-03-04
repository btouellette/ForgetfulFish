import { describe, expect, it } from "vitest";

import { createInitialGameState } from "../../src/state/gameState";
import { type Command } from "../../src/commands/command";
import { Rng } from "../../src/rng/rng";
import { serializeGameState } from "../../src/state/serialization";
import {
  processCommand,
  type CommandResult,
  type CommandHandlerResult
} from "../../src/engine/processCommand";

function sampleCommand(type: Command["type"]): Command {
  switch (type) {
    case "CAST_SPELL":
      return { type: "CAST_SPELL", cardId: "obj-1", targets: [] };
    case "ACTIVATE_ABILITY":
      return { type: "ACTIVATE_ABILITY", sourceId: "obj-1", abilityIndex: 0, targets: [] };
    case "PASS_PRIORITY":
      return { type: "PASS_PRIORITY" };
    case "MAKE_CHOICE":
      return {
        type: "MAKE_CHOICE",
        payload: { type: "CHOOSE_YES_NO", accepted: true }
      };
    case "DECLARE_ATTACKERS":
      return { type: "DECLARE_ATTACKERS", attackers: [] };
    case "DECLARE_BLOCKERS":
      return { type: "DECLARE_BLOCKERS", assignments: [] };
    case "PLAY_LAND":
      return { type: "PLAY_LAND", cardId: "obj-1" };
    case "CONCEDE":
      return { type: "CONCEDE" };
    default: {
      const neverType: never = type;
      return neverType;
    }
  }
}

describe("engine/processCommand", () => {
  it("returns a valid CommandResult shape for PASS_PRIORITY", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-1", rngSeed: "seed-1" });
    const rng = new Rng(state.rngSeed);

    const result = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result.nextState).toBeDefined();
    expect(result.newEvents).toEqual([]);
    expect("pendingChoice" in result).toBe(true);
  });

  it("updates rngSeed when the provided RNG has already advanced", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-2", rngSeed: "seed-2" });
    const rng = new Rng(state.rngSeed);
    rng.next();

    const result = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result.nextState.rngSeed).not.toBe(state.rngSeed);
    expect(result.nextState.rngSeed).toBe(rng.getSeed());
  });

  it("preserves rngSeed when RNG has not advanced", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-3", rngSeed: "seed-3" });
    const rng = new Rng(state.rngSeed);

    const result = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result.nextState.rngSeed).toBe(state.rngSeed);
  });

  it("includes nextState, newEvents, and pendingChoice in CommandResult", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-4", rngSeed: "seed-4" });
    const rng = new Rng(state.rngSeed);

    const result: CommandResult = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result).toHaveProperty("nextState");
    expect(result).toHaveProperty("newEvents");
    expect(result).toHaveProperty("pendingChoice");
  });

  it("keeps CommandResult.pendingChoice synchronized with nextState.pendingChoice", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-4b", rngSeed: "seed-4b" });
    const stateWithChoice = {
      ...state,
      pendingChoice: { type: "CHOOSE_YES_NO" }
    };
    const rng = new Rng(stateWithChoice.rngSeed);

    const result = processCommand(stateWithChoice, { type: "PASS_PRIORITY" }, rng);

    expect(result.pendingChoice).toEqual(stateWithChoice.pendingChoice);
    expect(result.pendingChoice).toEqual(result.nextState.pendingChoice);
  });

  it("does not mutate the input Readonly<GameState>", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-5", rngSeed: "seed-5" });
    const before = serializeGameState(state);
    const rng = new Rng(state.rngSeed);

    processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(serializeGameState(state)).toEqual(before);
  });

  it("handles every command type through an exhaustive switch", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-6", rngSeed: "seed-6" });
    const rng = new Rng(state.rngSeed);

    const outputs = [
      sampleCommand("CAST_SPELL"),
      sampleCommand("ACTIVATE_ABILITY"),
      sampleCommand("PASS_PRIORITY"),
      sampleCommand("MAKE_CHOICE"),
      sampleCommand("DECLARE_ATTACKERS"),
      sampleCommand("DECLARE_BLOCKERS"),
      sampleCommand("PLAY_LAND"),
      sampleCommand("CONCEDE")
    ].map((command): CommandHandlerResult => processCommand(state, command, rng));

    expect(outputs).toHaveLength(8);
  });
});
