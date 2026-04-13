import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { dandanCardDefinition } from "../../src/cards/dandan";
import { addContinuousEffect, LAYERS } from "../../src/effects/continuous/layers";
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

const nullToughnessCreatureDefinition: CardDefinition = {
  id: "null-toughness-creature",
  name: "Null Toughness Creature",
  manaCost: {},
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Shapeshifter" }],
  color: [],
  supertypes: [],
  power: null,
  toughness: null,
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
    expect(applied.state.version).toBe(Math.max(...applied.events.map((event) => event.seq)));
  });

  it("does not apply zero-toughness SBA to creatures with null toughness", () => {
    cardRegistry.set(nullToughnessCreatureDefinition.id, nullToughnessCreatureDefinition);

    const state = createInitialGameState("p1", "p2", { id: "sba-4b", rngSeed: "seed-sba-4b" });
    putOnBattlefield(state, "obj-null-toughness", nullToughnessCreatureDefinition.id, "p1");

    expect(checkSBAs(state)).toEqual([]);
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

  it("moves Dandan to the graveyard when its controller controls no Islands", () => {
    cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);

    const state = createInitialGameState("p1", "p2", {
      id: "sba-dandan-no-islands",
      rngSeed: "seed-sba-dandan-no-islands"
    });
    putOnBattlefield(state, "obj-dandan", dandanCardDefinition.id, "p1");

    const sbas = checkSBAs(state);
    const applied = applySBAs(state, sbas);
    const graveyard =
      applied.state.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];

    expect(sbas).toContainEqual({
      type: "SACRIFICE_WHEN_NO_LAND_TYPE",
      objectId: "obj-dandan",
      landType: "Island"
    });
    expect(graveyard).toContain("obj-dandan");
    expect(applied.events.some((event) => event.type === "ZONE_CHANGE")).toBe(true);
  });

  it("does not sacrifice Dandan when a controlling effect makes the player control an Island", () => {
    cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);

    const state = createInitialGameState("p1", "p2", {
      id: "sba-dandan-controlled-island",
      rngSeed: "seed-sba-dandan-controlled-island"
    });
    putOnBattlefield(state, "obj-dandan", dandanCardDefinition.id, "p1");
    putOnBattlefield(state, "obj-island", "island", "p2");

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-control-island",
      source: { id: "obj-dandan", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-island", zcc: 0 } },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    expect(checkSBAs(withControlEffect)).toEqual([]);
  });

  it("uses derived toughness when a Layer 7a effect sets a creature to zero toughness", () => {
    cardRegistry.set(grizzlyDefinition.id, grizzlyDefinition);

    const state = createInitialGameState("p1", "p2", {
      id: "sba-derived-toughness",
      rngSeed: "seed-sba-derived-toughness"
    });
    putOnBattlefield(state, "obj-grizzly", grizzlyDefinition.id, "p1");

    const withSetPtEffect = addContinuousEffect(state, {
      id: "effect-zero-pt",
      source: { id: "obj-grizzly", zcc: 0 },
      layer: LAYERS.PT_SET,
      sublayer: LAYERS.PT_SET,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-grizzly", zcc: 0 } },
      effect: {
        kind: "set_pt",
        payload: { power: 0, toughness: 0 }
      }
    });

    expect(checkSBAs(withSetPtEffect)).toContainEqual({
      type: "DESTROY_ZERO_TOUGHNESS",
      objectId: "obj-grizzly"
    });
  });

  it("removes while_source_on_battlefield effects after SBA moves their source off the battlefield", () => {
    cardRegistry.set(grizzlyDefinition.id, grizzlyDefinition);

    const state = createInitialGameState("p1", "p2", {
      id: "sba-remove-source-based-effect",
      rngSeed: "seed-sba-remove-source-based-effect"
    });
    putOnBattlefield(state, "obj-grizzly", grizzlyDefinition.id, "p1");

    const withEffects = addContinuousEffect(
      addContinuousEffect(state, {
        id: "effect-zero-pt",
        source: { id: "obj-grizzly", zcc: 0 },
        layer: LAYERS.PT_SET,
        sublayer: LAYERS.PT_SET,
        timestamp: 1,
        duration: "until_end_of_turn",
        appliesTo: { kind: "object", object: { id: "obj-grizzly", zcc: 0 } },
        effect: {
          kind: "set_pt",
          payload: { power: 0, toughness: 0 }
        }
      }),
      {
        id: "effect-source-bound",
        source: { id: "obj-grizzly", zcc: 0 },
        layer: LAYERS.CONTROL,
        timestamp: 2,
        duration: "while_source_on_battlefield",
        appliesTo: { kind: "object", object: { id: "obj-grizzly", zcc: 0 } },
        effect: { kind: "set_controller", payload: { playerId: "p2" } }
      }
    );

    const result = runSBALoop(withEffects);

    expect(result.state.continuousEffects.map((effect) => effect.id)).toEqual(["effect-zero-pt"]);
    expect(result.events.map((event) => event.type)).toContain("ZONE_CHANGE");
    expect(result.events.map((event) => event.type)).toContain("CONTINUOUS_EFFECT_REMOVED");
    expect(() => assertStateInvariants(result.state)).not.toThrow();
  });
});
