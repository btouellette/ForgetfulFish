import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  COMMAND_TYPES,
  Rng,
  SharedDeckMode,
  cardRegistry,
  createEvent,
  createInitialGameState,
  islandCardDefinition,
  processCommand,
  zoneKey
} from "../../src";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("integration/foundations", () => {
  it("exports Phase 0 foundations from the package root", () => {
    expect(ACTION_TYPES).toContain("DRAW");
    expect(COMMAND_TYPES).toContain("PASS_PRIORITY");
    expect(SharedDeckMode.id).toBe("shared-deck");
    expect(cardRegistry.get("island")).toEqual(islandCardDefinition);
    expect(typeof processCommand).toBe("function");
  });

  it("imports from package root without circular import runtime failures", () => {
    const state = createInitialGameState("p1", "p2", { id: "g-foundations", rngSeed: "seed" });
    const rng = new Rng(state.rngSeed);
    const result = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result.newEvents).toEqual([]);
    expect(zoneKey({ kind: "library", scope: "shared" })).toBe("shared:library");
    expect(
      createEvent({ engineVersion: "0.1.0", schemaVersion: 1, gameId: "g" }, 1, {
        type: "PRIORITY_PASSED",
        playerId: "p1"
      }).id
    ).toBe("g:1");
  });

  it("confirms legacy state.ts is removed", () => {
    const legacyStatePath = resolve(currentDir, "..", "..", "src", "state.ts");
    expect(existsSync(legacyStatePath)).toBe(false);
  });
});
