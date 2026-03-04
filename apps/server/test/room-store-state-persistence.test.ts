import { describe, expect, it } from "vitest";

import {
  createInitialGameState,
  serializeGameState,
  type SerializedGameState
} from "@forgetful-fish/game-engine";

import { fromPersistedGameState, toPersistedGameState } from "../src/room-store/state-persistence";

function containsMap(value: unknown): boolean {
  if (value instanceof Map) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((entry) => containsMap(entry));
  }

  if (typeof value === "object" && value !== null) {
    return Object.values(value).some((entry) => containsMap(entry));
  }

  return false;
}

describe("room-store state persistence", () => {
  it("converts runtime GameState to JSON-safe persisted state", () => {
    const state = createInitialGameState("player-1", "player-2", {
      id: "game-1",
      rngSeed: "seed-1"
    });
    const persisted = toPersistedGameState(state);

    expect(containsMap(persisted)).toBe(false);
  });

  it("round-trips persisted state back to runtime shape", () => {
    const state = createInitialGameState("player-1", "player-2", {
      id: "game-1",
      rngSeed: "seed-1"
    });
    const persisted = toPersistedGameState(state);
    const restored = fromPersistedGameState(persisted as SerializedGameState);

    expect(serializeGameState(restored)).toEqual(persisted);
  });
});
