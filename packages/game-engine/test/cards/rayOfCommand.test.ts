import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { rayOfCommandCardDefinition } from "../../src/cards/ray-of-command";
import { processCommand } from "../../src/engine/processCommand";
import { computeGameObject } from "../../src/effects/continuous/layers";
import { advanceStepWithEvents } from "../../src/engine/kernel";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const testCreatureDefinition: CardDefinition = {
  id: "test-ray-creature",
  name: "Ray Test Creature",
  manaCost: { blue: 1, generic: 1 },
  rulesText: "",
  typeLine: ["Creature"],
  subtypes: [],
  color: ["blue"],
  supertypes: [],
  power: 2,
  toughness: 2,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

function makeHandSpell(id: string, cardDefId: string, playerId: "p1" | "p2"): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: playerId,
    controller: playerId,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "hand", scope: "player", playerId }
  };
}

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  state.zones.set(handKey, [...(state.zones.get(handKey) ?? []), object.id]);
}

function putOnBattlefield(state: GameState, object: GameObject): void {
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function setMainPhasePriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = "p1";
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function setMana(state: GameState, playerId: "p1" | "p2", blue: number, colorless: number): void {
  const player = playerId === "p1" ? state.players[0] : state.players[1];
  player.manaPool = { ...player.manaPool, blue, colorless };
}

function castAndResolveRayOfCommandScenario(targetOverrides?: Partial<GameObject>) {
  cardRegistry.set(rayOfCommandCardDefinition.id, rayOfCommandCardDefinition);
  cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

  const state = createInitialGameState("p1", "p2", { id: "ray-of-command", rngSeed: "seed-ray" });
  setMainPhasePriority(state, "p1");
  setMana(state, "p1", 1, 3);

  putInHand(state, "p1", makeHandSpell("obj-ray", rayOfCommandCardDefinition.id, "p1"));
  putOnBattlefield(state, {
    id: "obj-target",
    zcc: 0,
    cardDefId: testCreatureDefinition.id,
    owner: "p2",
    controller: "p2",
    counters: new Map(),
    damage: 0,
    tapped: true,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "battlefield", scope: "shared" },
    ...targetOverrides
  });

  const castRay = processCommand(
    state,
    {
      type: "CAST_SPELL",
      cardId: "obj-ray",
      targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
    },
    new Rng(state.rngSeed)
  );
  const passP1 = processCommand(
    castRay.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(state.rngSeed)
  );
  const resolveRay = processCommand(
    passP1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(state.rngSeed)
  );

  return {
    initial: state,
    castRay,
    resolved: resolveRay
  };
}

describe("cards/ray-of-command", () => {
  it("loads as a 4-mana blue instant", () => {
    expect(rayOfCommandCardDefinition.id).toBe("ray-of-command");
    expect(rayOfCommandCardDefinition.manaCost).toEqual({ blue: 1, generic: 3 });
    expect(rayOfCommandCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("can be cast targeting a battlefield creature", () => {
    const { castRay } = castAndResolveRayOfCommandScenario();
    const top = castRay.nextState.stack[castRay.nextState.stack.length - 1];

    expect(top?.object.id).toBe("obj-ray");
    expect(top?.targets[0]).toEqual({ kind: "object", object: { id: "obj-target", zcc: 0 } });
  });

  it("gives the caster control of the target until end of turn", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();

    expect(resolved.nextState.objectPool.get("obj-target")?.controller).toBe("p2");
    expect(computeGameObject("obj-target", resolved.nextState).controller).toBe("p1");
  });

  it("untaps the targeted creature on resolution", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();

    expect(resolved.nextState.objectPool.get("obj-target")?.tapped).toBe(false);
  });

  it("adds a must-attack continuous effect for the targeted creature", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();

    expect(
      resolved.nextState.continuousEffects.some(
        (effect) =>
          effect.appliesTo.kind === "object" &&
          effect.appliesTo.object.id === "obj-target" &&
          effect.effect.kind === "must_attack" &&
          effect.duration === "until_end_of_turn"
      )
    ).toBe(true);
  });

  it("grants haste so a summoning-sick target can attack this turn", () => {
    const { resolved } = castAndResolveRayOfCommandScenario({ summoningSick: true });
    const declareAttackersState: GameState = {
      ...resolved.nextState,
      turnState: {
        ...resolved.nextState.turnState,
        phase: "DECLARE_ATTACKERS",
        step: "DECLARE_ATTACKERS",
        activePlayerId: "p1",
        priorityState: createInitialPriorityState("p1")
      },
      players: [
        { ...resolved.nextState.players[0], priority: true },
        { ...resolved.nextState.players[1], priority: false }
      ] as GameState["players"]
    };

    const declared = processCommand(
      declareAttackersState,
      { type: "DECLARE_ATTACKERS", attackers: ["obj-target"] },
      new Rng(declareAttackersState.rngSeed)
    );

    expect(declared.nextState.turnState.attackers).toEqual(["obj-target"]);
  });

  it("requires the affected creature to attack if able", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();
    const declareAttackersState: GameState = {
      ...resolved.nextState,
      turnState: {
        ...resolved.nextState.turnState,
        phase: "DECLARE_ATTACKERS",
        step: "DECLARE_ATTACKERS",
        activePlayerId: "p1",
        priorityState: createInitialPriorityState("p1")
      },
      players: [
        { ...resolved.nextState.players[0], priority: true },
        { ...resolved.nextState.players[1], priority: false }
      ] as GameState["players"]
    };

    expect(() =>
      processCommand(
        declareAttackersState,
        { type: "DECLARE_ATTACKERS", attackers: [] },
        new Rng(declareAttackersState.rngSeed)
      )
    ).toThrow("must-attack creatures that are able to attack must be declared as attackers");
  });

  it("does not allow priority passing to skip a required attack", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();
    const declareAttackersState: GameState = {
      ...resolved.nextState,
      turnState: {
        ...resolved.nextState.turnState,
        phase: "DECLARE_ATTACKERS",
        step: "DECLARE_ATTACKERS",
        activePlayerId: "p1",
        priorityState: createInitialPriorityState("p1")
      },
      players: [
        { ...resolved.nextState.players[0], priority: true },
        { ...resolved.nextState.players[1], priority: false }
      ] as GameState["players"]
    };

    expect(() =>
      processCommand(
        declareAttackersState,
        { type: "PASS_PRIORITY" },
        new Rng(declareAttackersState.rngSeed)
      )
    ).toThrow("must-attack creatures must be declared before passing priority");
  });

  it("works for permanents owned by the shared deck but controlled by another player", () => {
    const { resolved } = castAndResolveRayOfCommandScenario({ owner: "p1", controller: "p2" });

    expect(computeGameObject("obj-target", resolved.nextState).controller).toBe("p1");
  });

  it("reverts control after cleanup removes until-end-of-turn effects", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();
    const cleanupState: GameState = {
      ...resolved.nextState,
      turnState: {
        ...resolved.nextState.turnState,
        phase: "CLEANUP",
        step: "CLEANUP"
      }
    };

    const nextTurnState = advanceStepWithEvents(cleanupState, new Rng(cleanupState.rngSeed)).state;

    expect(nextTurnState.continuousEffects).toHaveLength(0);
    expect(computeGameObject("obj-target", nextTurnState).controller).toBe("p2");
  });

  it("preserves state invariants after Ray of Command resolves", () => {
    const { resolved } = castAndResolveRayOfCommandScenario();

    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
