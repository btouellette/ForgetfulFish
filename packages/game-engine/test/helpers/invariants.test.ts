import { describe, expect, it } from "vitest";

import { createInitialGameState, type GameState } from "../../src/state/gameState";
import type { GameObject } from "../../src/state/gameObject";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "./invariants";

function makeObject(id: string): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: "island",
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "library", scope: "shared" }
  };
}

function makeState(): GameState {
  return createInitialGameState("p1", "p2", { id: "inv-test", rngSeed: "seed" });
}

describe("helpers/invariants", () => {
  it("passes for a valid initial state", () => {
    const state = makeState();
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("fails when a zone references an object missing from objectPool", () => {
    const state = makeState();
    const library = state.zones.get(zoneKey({ kind: "library", scope: "shared" }));
    if (!library) {
      throw new Error("missing shared library zone");
    }
    library.push("ghost-1");

    expect(() => assertStateInvariants(state)).toThrow(/missing from objectPool/);
  });

  it("fails when objectPool contains an object not present in any zone", () => {
    const state = makeState();
    state.objectPool.set("obj-1", makeObject("obj-1"));

    expect(() => assertStateInvariants(state)).toThrow(/not assigned to any zone/);
  });

  it("fails when an object id appears in multiple zones", () => {
    const state = makeState();
    const object = makeObject("obj-2");
    state.objectPool.set(object.id, object);

    const library = state.zones.get(zoneKey({ kind: "library", scope: "shared" }));
    const graveyard = state.zones.get(zoneKey({ kind: "graveyard", scope: "shared" }));
    if (!library || !graveyard) {
      throw new Error("missing shared zones");
    }
    library.push(object.id);
    graveyard.push(object.id);

    expect(() => assertStateInvariants(state)).toThrow(/duplicate object id/);
  });

  it("fails when an object's recorded zone does not match its actual zone", () => {
    const state = makeState();
    const object = makeObject("obj-zone-mismatch");
    object.zone = { kind: "library", scope: "shared" };
    state.objectPool.set(object.id, object);

    const graveyard = state.zones.get(zoneKey({ kind: "graveyard", scope: "shared" }));
    if (!graveyard) {
      throw new Error("missing shared graveyard zone");
    }
    graveyard.push(object.id);

    expect(() => assertStateInvariants(state)).toThrow(/zone mismatch/);
  });

  it("fails when a zone contains the same object id multiple times", () => {
    const state = makeState();
    const object = makeObject("obj-dup-same-zone");
    state.objectPool.set(object.id, object);

    const library = state.zones.get(zoneKey({ kind: "library", scope: "shared" }));
    if (!library) {
      throw new Error("missing shared library zone");
    }
    library.push(object.id);
    library.push(object.id);

    expect(() => assertStateInvariants(state)).toThrow(/duplicate object id/);
  });

  it("fails when a player's mana pool contains a negative value", () => {
    const state = makeState();
    state.players[0].manaPool.blue = -1;

    expect(() => assertStateInvariants(state)).toThrow(/negative mana/);
  });

  it("fails when a player's life total is not an integer", () => {
    const state = makeState();
    state.players[1].life = 19.5;

    expect(() => assertStateInvariants(state)).toThrow(/life total must be an integer/);
  });

  it("fails when player hand count diverges from hand zone entries", () => {
    const state = makeState();
    const object = makeObject("obj-in-hand-view");
    object.zone = { kind: "library", scope: "shared" };
    state.objectPool.set(object.id, object);

    const library = state.zones.get(zoneKey({ kind: "library", scope: "shared" }));
    if (!library) {
      throw new Error("missing shared library zone");
    }
    library.push(object.id);

    state.players[0].hand.push(object.id);

    expect(() => assertStateInvariants(state)).toThrow(/hand count mismatch/);
  });
});
