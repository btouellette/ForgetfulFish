import { describe, expect, it } from "vitest";

import type { GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import {
  createCombatDamageState,
  getSharedGraveyard,
  putCombatPermanent,
  resolveCombatDamageStep
} from "../helpers/combatDamageFixture";
import { assertStateInvariants } from "../helpers/invariants";

describe("engine/combatDamage", () => {
  it("has an unblocked Dandan deal exactly 4 damage to the defending player", () => {
    const state = createCombatDamageState();
    putCombatPermanent(state, "obj-attacker", "dandan", "p1");
    putCombatPermanent(state, "obj-p1-island", "island", "p1");
    putCombatPermanent(state, "obj-p2-island", "island", "p2");
    state.turnState.attackers = ["obj-attacker"];

    const result = resolveCombatDamageStep(state);

    expect(result.nextState.players[1].life).toBe(16);
    expect(result.newEvents).toContainEqual(
      expect.objectContaining({
        type: "DAMAGE_DEALT",
        source: { id: "obj-attacker", zcc: 0 },
        target: { kind: "player", playerId: "p2" },
        amount: 4
      })
    );
    expect(result.newEvents).toContainEqual(
      expect.objectContaining({
        type: "LIFE_CHANGED",
        playerId: "p2",
        amount: -4,
        newTotal: 16
      })
    );
    expect(result.newEvents.map((event) => event.type)).toContain("PHASE_CHANGED");
    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });

  it("has two Dandans deal simultaneous lethal damage to each other", () => {
    const state = createCombatDamageState();
    putCombatPermanent(state, "obj-attacker", "dandan", "p1");
    putCombatPermanent(state, "obj-blocker", "dandan", "p2");
    putCombatPermanent(state, "obj-p1-island", "island", "p1");
    putCombatPermanent(state, "obj-p2-island", "island", "p2");
    state.turnState.attackers = ["obj-attacker"];
    state.turnState.blockers = [{ attackerId: "obj-attacker", blockerId: "obj-blocker" }];

    const result = resolveCombatDamageStep(state);
    const graveyard = getSharedGraveyard(result.nextState);
    const eventTypes = result.newEvents.map((event) => event.type);

    expect(eventTypes.filter((type) => type === "DAMAGE_DEALT")).toHaveLength(2);
    expect(graveyard).toContain("obj-attacker");
    expect(graveyard).toContain("obj-blocker");
    expect(result.nextState.objectPool.get("obj-attacker")?.damage).toBe(0);
    expect(result.nextState.objectPool.get("obj-blocker")?.damage).toBe(0);
    expect(eventTypes.indexOf("DAMAGE_DEALT")).toBeLessThan(eventTypes.indexOf("ZONE_CHANGE"));
    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });

  it("marks the defending player as lost when combat damage reduces them to 0 life", () => {
    const state = createCombatDamageState();
    putCombatPermanent(state, "obj-attacker", "dandan", "p1");
    putCombatPermanent(state, "obj-p1-island", "island", "p1");
    putCombatPermanent(state, "obj-p2-island", "island", "p2");
    state.turnState.attackers = ["obj-attacker"];
    state.players[1].life = 4;

    const result = resolveCombatDamageStep(state);

    expect(result.nextState.players[1].hasLost).toBe(true);
    expect(result.newEvents).toContainEqual(
      expect.objectContaining({ type: "PLAYER_LOST", playerId: "p2", reason: "life_0_or_less" })
    );
    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });

  it("clears marked creature damage during cleanup", () => {
    const state = createCombatDamageState();
    putCombatPermanent(state, "obj-attacker", "test-creature", "p1");
    putCombatPermanent(state, "obj-blocker", "test-creature", "p2");
    state.turnState.attackers = ["obj-attacker"];
    state.turnState.blockers = [{ attackerId: "obj-attacker", blockerId: "obj-blocker" }];

    const damaged = resolveCombatDamageStep(state);
    expect(damaged.nextState.objectPool.get("obj-attacker")?.damage).toBe(2);
    expect(damaged.nextState.objectPool.get("obj-blocker")?.damage).toBe(2);

    const cleanupState: GameState = {
      ...damaged.nextState,
      turnState: {
        ...damaged.nextState.turnState,
        phase: "CLEANUP",
        step: "CLEANUP",
        priorityState: createInitialPriorityState(damaged.nextState.turnState.activePlayerId)
      },
      players: [
        { ...damaged.nextState.players[0], priority: true },
        { ...damaged.nextState.players[1], priority: false }
      ]
    };

    const cleaned = resolveCombatDamageStep(cleanupState);
    expect(cleaned.nextState.objectPool.get("obj-attacker")?.damage).toBe(0);
    expect(cleaned.nextState.objectPool.get("obj-blocker")?.damage).toBe(0);
    expect(() => assertStateInvariants(cleaned.nextState)).not.toThrow();
  });

  it("resolves multiple combat pairs simultaneously without order-dependent bugs", () => {
    const state = createCombatDamageState();
    putCombatPermanent(state, "obj-attacker-a", "dandan", "p1");
    putCombatPermanent(state, "obj-attacker-b", "dandan", "p1");
    putCombatPermanent(state, "obj-blocker-a", "dandan", "p2");
    putCombatPermanent(state, "obj-blocker-b", "dandan", "p2");
    putCombatPermanent(state, "obj-p1-island", "island", "p1");
    putCombatPermanent(state, "obj-p2-island", "island", "p2");
    state.turnState.attackers = ["obj-attacker-a", "obj-attacker-b"];
    state.turnState.blockers = [
      { attackerId: "obj-attacker-a", blockerId: "obj-blocker-a" },
      { attackerId: "obj-attacker-b", blockerId: "obj-blocker-b" }
    ];

    const result = resolveCombatDamageStep(state);
    const graveyard = getSharedGraveyard(result.nextState);

    expect(graveyard).toEqual(
      expect.arrayContaining(["obj-attacker-a", "obj-attacker-b", "obj-blocker-a", "obj-blocker-b"])
    );
    expect(result.newEvents.filter((event) => event.type === "DAMAGE_DEALT")).toHaveLength(4);
    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });

  it("one attacker blocked by two 2/3 creatures assigns damage in order and results in expected deaths", () => {
    const state = createCombatDamageState();
    putCombatPermanent(state, "obj-attacker", "dandan", "p1");
    putCombatPermanent(state, "obj-blocker-a", "test-creature", "p2");
    putCombatPermanent(state, "obj-blocker-b", "test-creature", "p2");
    putCombatPermanent(state, "obj-p1-island", "island", "p1");
    putCombatPermanent(state, "obj-p2-island", "island", "p2");
    state.turnState.attackers = ["obj-attacker"];
    state.turnState.blockers = [
      { attackerId: "obj-attacker", blockerId: "obj-blocker-a" },
      { attackerId: "obj-attacker", blockerId: "obj-blocker-b" }
    ];

    const result = resolveCombatDamageStep(state);
    const graveyard = getSharedGraveyard(result.nextState);

    expect(result.nextState.objectPool.get("obj-attacker")?.damage ?? 0).toBe(0);
    expect(graveyard).toContain("obj-attacker");
    expect(graveyard).toContain("obj-blocker-a");
    expect(graveyard).not.toContain("obj-blocker-b");
    expect(result.nextState.objectPool.get("obj-blocker-a")?.damage).toBe(0);
    expect(result.nextState.objectPool.get("obj-blocker-b")?.damage).toBe(1);

    expect(result.newEvents.map((e) => e.type)).toEqual([
      "PRIORITY_PASSED",
      "DAMAGE_DEALT",
      "DAMAGE_DEALT",
      "DAMAGE_DEALT",
      "DAMAGE_DEALT",
      "ZONE_CHANGE",
      "ZONE_CHANGE",
      "PHASE_CHANGED"
    ]);

    const damageEvents = result.newEvents
      .filter((e): e is Extract<typeof e, { type: "DAMAGE_DEALT" }> => e.type === "DAMAGE_DEALT")
      .map(({ source, target, amount }) => ({ source, target, amount }));

    expect(damageEvents).toEqual([
      {
        source: { id: "obj-blocker-a", zcc: 0 },
        target: { kind: "object", object: { id: "obj-attacker", zcc: 0 } },
        amount: 2
      },
      {
        source: { id: "obj-blocker-b", zcc: 0 },
        target: { kind: "object", object: { id: "obj-attacker", zcc: 0 } },
        amount: 2
      },
      {
        source: { id: "obj-attacker", zcc: 0 },
        target: { kind: "object", object: { id: "obj-blocker-a", zcc: 0 } },
        amount: 3
      },
      {
        source: { id: "obj-attacker", zcc: 0 },
        target: { kind: "object", object: { id: "obj-blocker-b", zcc: 0 } },
        amount: 1
      }
    ]);

    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });
});
