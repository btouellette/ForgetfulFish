import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { applySBAs, checkSBAs, runSBALoop, type SBAResult } from "../../src/engine/sba";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const nulllingDefinition: CardDefinition = {
  id: "nullling",
  name: "Nullling",
  manaCost: {},
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Illusion" }],
  color: [],
  supertypes: [],
  power: 0,
  toughness: 0,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const grizzlyDefinition: CardDefinition = {
  id: "grizzly-cub",
  name: "Grizzly Cub",
  manaCost: {},
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Bear" }],
  color: [],
  supertypes: [],
  power: 1,
  toughness: 1,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

function putOnBattlefield(
  state: GameState,
  objectId: string,
  cardDefId: string,
  owner: "p1" | "p2"
): void {
  const battlefield = state.mode.resolveZone(state, "battlefield", owner);
  const object: GameObject = {
    id: objectId,
    zcc: 0,
    cardDefId,
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: battlefield
  };

  state.objectPool.set(objectId, object);
  state.zones.get(zoneKey(battlefield))?.push(objectId);
}

describe("engine/sba", () => {
  it("moves creature with zero toughness from battlefield to graveyard", () => {
    cardRegistry.set(nulllingDefinition.id, nulllingDefinition);

    const state = createInitialGameState("p1", "p2", { id: "sba-1", rngSeed: "seed-sba-1" });
    putOnBattlefield(state, "obj-nullling", nulllingDefinition.id, "p1");

    const sbas = checkSBAs(state);
    const applied = applySBAs(state, sbas);
    const graveyard =
      applied.state.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];

    expect(sbas).toContainEqual({ type: "DESTROY_ZERO_TOUGHNESS", objectId: "obj-nullling" });
    expect(graveyard).toContain("obj-nullling");
    expect(applied.events.some((event) => event.type === "ZONE_CHANGE")).toBe(true);
  });

  it("marks player as lost when life is zero", () => {
    const state = createInitialGameState("p1", "p2", { id: "sba-2", rngSeed: "seed-sba-2" });
    state.players[0].life = 0;

    const applied = applySBAs(state, checkSBAs(state));

    expect(applied.state.players[0].hasLost).toBe(true);
    expect(applied.events.some((event) => event.type === "PLAYER_LOST")).toBe(true);
  });

  it("SBA loop reaches fixed point", () => {
    cardRegistry.set(nulllingDefinition.id, nulllingDefinition);

    const state = createInitialGameState("p1", "p2", { id: "sba-3", rngSeed: "seed-sba-3" });
    putOnBattlefield(state, "obj-nullling", nulllingDefinition.id, "p1");

    const result = runSBALoop(state);

    expect(checkSBAs(result.state)).toEqual([]);
  });

  it("applies simultaneous SBAs in one cycle", () => {
    cardRegistry.set(nulllingDefinition.id, nulllingDefinition);

    const state = createInitialGameState("p1", "p2", { id: "sba-4", rngSeed: "seed-sba-4" });
    putOnBattlefield(state, "obj-nullling", nulllingDefinition.id, "p1");
    state.players[1].life = 0;

    const sbas = checkSBAs(state);
    const sbaTypes = sbas.map((sba) => sba.type);
    const applied = applySBAs(state, sbas);

    expect(sbaTypes).toContain("DESTROY_ZERO_TOUGHNESS");
    expect(sbaTypes).toContain("PLAYER_LOSES");
    expect(applied.state.players[1].hasLost).toBe(true);
    expect(applied.events.some((event) => event.type === "ZONE_CHANGE")).toBe(true);
    expect(applied.events.some((event) => event.type === "PLAYER_LOST")).toBe(true);
  });

  it("preserves state invariants before and after SBA cycle", () => {
    cardRegistry.set(nulllingDefinition.id, nulllingDefinition);

    const state = createInitialGameState("p1", "p2", { id: "sba-5", rngSeed: "seed-sba-5" });
    putOnBattlefield(state, "obj-nullling", nulllingDefinition.id, "p1");

    expect(() => assertStateInvariants(state)).not.toThrow();
    const result = runSBALoop(state);
    expect(() => assertStateInvariants(result.state)).not.toThrow();
  });

  it("produces no SBA results when no conditions are met", () => {
    cardRegistry.set(grizzlyDefinition.id, grizzlyDefinition);

    const state = createInitialGameState("p1", "p2", { id: "sba-6", rngSeed: "seed-sba-6" });
    putOnBattlefield(state, "obj-grizzly", grizzlyDefinition.id, "p1");

    const sbas: SBAResult[] = checkSBAs(state);
    expect(sbas).toEqual([]);
    expect(runSBALoop(state).events).toEqual([]);
  });
});
