import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { getLegalCommands } from "../../src/commands/validate";
import { addContinuousEffect, LAYERS } from "../../src/effects/continuous/layers";
import type { GameObject } from "../../src/state/gameObject";
import {
  createInitialGameState,
  type GameState,
  type PendingChoice
} from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const testInstantDefinition: CardDefinition = {
  id: "legal-test-instant",
  name: "Legal Test Instant",
  manaCost: { blue: 1 },
  typeLine: ["Instant"],
  subtypes: [],
  color: ["blue"],
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

const testCreatureDefinition: CardDefinition = {
  id: "legal-test-creature",
  name: "Legal Test Creature",
  manaCost: { blue: 1 },
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Fish" }],
  color: ["blue"],
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

function setPriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function putCardInHand(
  state: GameState,
  playerId: "p1" | "p2",
  card: { id: string; cardDefId: string }
): void {
  const object: GameObject = {
    id: card.id,
    zcc: 0,
    cardDefId: card.cardDefId,
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

  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId }))?.push(object.id);
}

function putOnBattlefield(
  state: GameState,
  playerId: "p1" | "p2",
  card: { id: string; cardDefId: string }
): void {
  const object: GameObject = {
    id: card.id,
    zcc: 0,
    cardDefId: card.cardDefId,
    owner: playerId,
    controller: playerId,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "battlefield", scope: "shared" }
  };

  state.objectPool.set(object.id, object);
  state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(object.id);
}

function yesNoPendingChoice(forPlayer: "p1" | "p2"): PendingChoice {
  return {
    id: `choice-${forPlayer}-yes-no`,
    type: "CHOOSE_YES_NO",
    forPlayer,
    prompt: "Choose yes or no",
    constraints: { prompt: "Choose yes or no" }
  };
}

describe("commands/legal", () => {
  it("main phase with Island in hand includes PLAY_LAND and PASS_PRIORITY", () => {
    const state = createInitialGameState("p1", "p2", { id: "legal-1", rngSeed: "seed-legal-1" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    setPriority(state, "p1");
    putCardInHand(state, "p1", { id: "obj-island", cardDefId: "island" });

    const commands = getLegalCommands(state);

    expect(commands.some((command) => command.type === "PASS_PRIORITY")).toBe(true);
    expect(commands.some((command) => command.type === "PLAY_LAND")).toBe(true);
  });

  it("with no hand and no castable actions returns only PASS_PRIORITY and CONCEDE", () => {
    const state = createInitialGameState("p1", "p2", { id: "legal-2", rngSeed: "seed-legal-2" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    setPriority(state, "p1");

    const commands = getLegalCommands(state);

    expect(commands).toEqual([{ type: "PASS_PRIORITY" }, { type: "CONCEDE" }]);
  });

  it("pending yes/no choice returns MAKE_CHOICE options and CONCEDE", () => {
    const base = createInitialGameState("p1", "p2", { id: "legal-3", rngSeed: "seed-legal-3" });
    const state: GameState = {
      ...base,
      pendingChoice: yesNoPendingChoice("p1")
    };

    const commands = getLegalCommands(state);

    expect(commands).toHaveLength(3);
    expect(commands).toEqual([
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: false } },
      { type: "CONCEDE" }
    ]);
  });

  it("does not emit placeholder MAKE_CHOICE commands for constrained non-yes/no choices", () => {
    const base = createInitialGameState("p1", "p2", {
      id: "legal-non-yes-no-choice",
      rngSeed: "seed-legal-non-yes-no-choice"
    });
    const state: GameState = {
      ...base,
      pendingChoice: {
        id: "choice-cards",
        type: "CHOOSE_CARDS",
        forPlayer: "p1",
        prompt: "Choose exactly one card",
        constraints: {
          candidates: ["obj-a", "obj-b"],
          min: 1,
          max: 1
        }
      }
    };

    const commands = getLegalCommands(state);

    const makeChoiceCommands = commands.filter((command) => command.type === "MAKE_CHOICE");
    expect(makeChoiceCommands).toEqual([]);
    expect(commands).toContainEqual({ type: "CONCEDE" });
  });

  it("does not expose p1 card actions when p2 has priority", () => {
    const state = createInitialGameState("p1", "p2", { id: "legal-4", rngSeed: "seed-legal-4" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p2";
    setPriority(state, "p2");
    putCardInHand(state, "p1", { id: "obj-p1-island", cardDefId: "island" });

    const commands = getLegalCommands(state);

    const playLandCommands = commands.filter((command) => command.type === "PLAY_LAND");
    expect(playLandCommands).toEqual([]);
  });

  it("does not include DECLARE_ATTACKERS when the active player has no legal attackers", () => {
    const attackersState = createInitialGameState("p1", "p2", {
      id: "legal-5a",
      rngSeed: "seed-legal-5a"
    });
    attackersState.turnState.phase = "DECLARE_ATTACKERS";
    attackersState.turnState.step = "DECLARE_ATTACKERS";
    attackersState.turnState.activePlayerId = "p1";
    setPriority(attackersState, "p1");

    const attackersCommands = getLegalCommands(attackersState);
    expect(attackersCommands.some((command) => command.type === "DECLARE_ATTACKERS")).toBe(false);
  });

  it("includes DECLARE_ATTACKERS when the active player controls an untapped non-summoning-sick creature", () => {
    cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

    const attackersState = createInitialGameState("p1", "p2", {
      id: "legal-5a-creature",
      rngSeed: "seed-legal-5a-creature"
    });
    attackersState.turnState.phase = "DECLARE_ATTACKERS";
    attackersState.turnState.step = "DECLARE_ATTACKERS";
    attackersState.turnState.activePlayerId = "p1";
    setPriority(attackersState, "p1");
    putOnBattlefield(attackersState, "p1", {
      id: "obj-legal-attacker",
      cardDefId: testCreatureDefinition.id
    });

    const attackersCommands = getLegalCommands(attackersState);
    expect(attackersCommands.some((command) => command.type === "DECLARE_ATTACKERS")).toBe(true);
  });

  it("includes DECLARE_ATTACKERS when control of an opposing creature changes continuously", () => {
    cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

    const attackersState = createInitialGameState("p1", "p2", {
      id: "legal-derived-attacker",
      rngSeed: "seed-legal-derived-attacker"
    });
    attackersState.turnState.phase = "DECLARE_ATTACKERS";
    attackersState.turnState.step = "DECLARE_ATTACKERS";
    attackersState.turnState.activePlayerId = "p1";
    setPriority(attackersState, "p1");
    putOnBattlefield(attackersState, "p2", {
      id: "obj-stolen-attacker",
      cardDefId: testCreatureDefinition.id
    });

    const withControlEffect = addContinuousEffect(attackersState, {
      id: "effect-stolen-attacker",
      source: { id: "source-attacker", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-stolen-attacker" },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    const attackersCommands = getLegalCommands(withControlEffect);
    expect(attackersCommands.some((command) => command.type === "DECLARE_ATTACKERS")).toBe(true);
  });

  it("includes required attackers in DECLARE_ATTACKERS when a creature must attack", () => {
    cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

    const attackersState = createInitialGameState("p1", "p2", {
      id: "legal-required-attacker",
      rngSeed: "seed-legal-required-attacker"
    });
    attackersState.turnState.phase = "DECLARE_ATTACKERS";
    attackersState.turnState.step = "DECLARE_ATTACKERS";
    attackersState.turnState.activePlayerId = "p1";
    setPriority(attackersState, "p1");
    putOnBattlefield(attackersState, "p2", {
      id: "obj-required-attacker",
      cardDefId: testCreatureDefinition.id
    });

    const withControlEffect = addContinuousEffect(
      addContinuousEffect(attackersState, {
        id: "effect-required-control",
        source: { id: "source-required-control", zcc: 0 },
        layer: LAYERS.CONTROL,
        timestamp: 1,
        duration: "until_end_of_turn",
        appliesTo: { kind: "object", objectId: "obj-required-attacker" },
        effect: { kind: "set_controller", payload: { playerId: "p1" } }
      }),
      {
        id: "effect-required-must-attack",
        source: { id: "source-required-must-attack", zcc: 0 },
        layer: LAYERS.ABILITY,
        timestamp: 2,
        duration: "until_end_of_turn",
        appliesTo: { kind: "object", objectId: "obj-required-attacker" },
        effect: { kind: "must_attack" }
      }
    );

    const declareAttackersCommand = withControlEffect
      ? getLegalCommands(withControlEffect).find((command) => command.type === "DECLARE_ATTACKERS")
      : undefined;

    expect(declareAttackersCommand).toEqual({
      type: "DECLARE_ATTACKERS",
      attackers: ["obj-required-attacker"]
    });
  });

  it("does not include DECLARE_BLOCKERS when the defending player has no legal blockers", () => {
    const blockersState = createInitialGameState("p1", "p2", {
      id: "legal-5b",
      rngSeed: "seed-legal-5b"
    });
    blockersState.turnState.phase = "DECLARE_BLOCKERS";
    blockersState.turnState.step = "DECLARE_BLOCKERS";
    blockersState.turnState.activePlayerId = "p1";
    setPriority(blockersState, "p2");

    const blockersCommands = getLegalCommands(blockersState);
    expect(blockersCommands.some((command) => command.type === "DECLARE_BLOCKERS")).toBe(false);
  });

  it("includes DECLARE_BLOCKERS when the defending player controls an untapped creature", () => {
    cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

    const blockersState = createInitialGameState("p1", "p2", {
      id: "legal-5b-creature",
      rngSeed: "seed-legal-5b-creature"
    });
    blockersState.turnState.phase = "DECLARE_BLOCKERS";
    blockersState.turnState.step = "DECLARE_BLOCKERS";
    blockersState.turnState.activePlayerId = "p1";
    blockersState.turnState.attackers = ["obj-declared-attacker"];
    setPriority(blockersState, "p2");
    putOnBattlefield(blockersState, "p2", {
      id: "obj-legal-blocker",
      cardDefId: testCreatureDefinition.id
    });

    const blockersCommands = getLegalCommands(blockersState);
    expect(blockersCommands.some((command) => command.type === "DECLARE_BLOCKERS")).toBe(true);
  });

  it("includes DECLARE_BLOCKERS when control of an opposing creature changes continuously", () => {
    cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

    const blockersState = createInitialGameState("p1", "p2", {
      id: "legal-derived-blocker",
      rngSeed: "seed-legal-derived-blocker"
    });
    blockersState.turnState.phase = "DECLARE_BLOCKERS";
    blockersState.turnState.step = "DECLARE_BLOCKERS";
    blockersState.turnState.activePlayerId = "p1";
    blockersState.turnState.attackers = ["obj-declared-attacker"];
    setPriority(blockersState, "p2");
    putOnBattlefield(blockersState, "p1", {
      id: "obj-stolen-blocker",
      cardDefId: testCreatureDefinition.id
    });

    const withControlEffect = addContinuousEffect(blockersState, {
      id: "effect-stolen-blocker",
      source: { id: "source-blocker", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-stolen-blocker" },
      effect: { kind: "set_controller", payload: { playerId: "p2" } }
    });

    const blockersCommands = getLegalCommands(withControlEffect);
    expect(blockersCommands.some((command) => command.type === "DECLARE_BLOCKERS")).toBe(true);
  });

  it("does not include DECLARE_BLOCKERS when there are no attackers to block", () => {
    cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

    const blockersState = createInitialGameState("p1", "p2", {
      id: "legal-5b-no-attackers",
      rngSeed: "seed-legal-5b-no-attackers"
    });
    blockersState.turnState.phase = "DECLARE_BLOCKERS";
    blockersState.turnState.step = "DECLARE_BLOCKERS";
    blockersState.turnState.activePlayerId = "p1";
    blockersState.turnState.attackers = [];
    setPriority(blockersState, "p2");
    putOnBattlefield(blockersState, "p2", {
      id: "obj-idle-blocker",
      cardDefId: testCreatureDefinition.id
    });

    const blockersCommands = getLegalCommands(blockersState);
    expect(blockersCommands.some((command) => command.type === "DECLARE_BLOCKERS")).toBe(false);
  });

  it("includes CAST_SPELL when cast is legal and invariants remain valid", () => {
    cardRegistry.set(testInstantDefinition.id, testInstantDefinition);

    const state = createInitialGameState("p1", "p2", { id: "legal-6", rngSeed: "seed-legal-6" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    setPriority(state, "p1");
    state.players[0].manaPool.blue = 1;
    putCardInHand(state, "p1", { id: "obj-cast", cardDefId: testInstantDefinition.id });

    const commands = getLegalCommands(state);

    expect(commands.some((command) => command.type === "CAST_SPELL")).toBe(true);
    expect(() => assertStateInvariants(state)).not.toThrow();
  });

  it("includes ACTIVATE_ABILITY for untapped Island with priority", () => {
    const state = createInitialGameState("p1", "p2", { id: "legal-7", rngSeed: "seed-legal-7" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    setPriority(state, "p1");
    putOnBattlefield(state, "p1", { id: "obj-activate-island", cardDefId: "island" });

    const commands = getLegalCommands(state);

    expect(
      commands.some(
        (command) =>
          command.type === "ACTIVATE_ABILITY" &&
          command.sourceId === "obj-activate-island" &&
          command.abilityIndex === 0
      )
    ).toBe(true);
  });

  it("includes ACTIVATE_ABILITY for a land controlled via a continuous effect", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "legal-derived-activate",
      rngSeed: "seed-legal-derived-activate"
    });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    setPriority(state, "p1");
    putOnBattlefield(state, "p2", { id: "obj-stolen-island", cardDefId: "island" });

    const withControlEffect = addContinuousEffect(state, {
      id: "effect-stolen-island",
      source: { id: "source-island", zcc: 0 },
      layer: LAYERS.CONTROL,
      timestamp: 1,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", objectId: "obj-stolen-island" },
      effect: { kind: "set_controller", payload: { playerId: "p1" } }
    });

    const commands = getLegalCommands(withControlEffect);

    expect(
      commands.some(
        (command) =>
          command.type === "ACTIVATE_ABILITY" &&
          command.sourceId === "obj-stolen-island" &&
          command.abilityIndex === 0
      )
    ).toBe(true);
  });

  it("ignores cards with missing definitions in hand without throwing", () => {
    const state = createInitialGameState("p1", "p2", { id: "legal-8", rngSeed: "seed-legal-8" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    setPriority(state, "p1");
    putCardInHand(state, "p1", { id: "obj-missing-def-hand", cardDefId: "missing-def-id" });

    const commands = getLegalCommands(state);

    expect(commands.some((command) => command.type === "CAST_SPELL")).toBe(false);
    expect(commands.some((command) => command.type === "PLAY_LAND")).toBe(false);
    expect(commands).toContainEqual({ type: "PASS_PRIORITY" });
    expect(commands).toContainEqual({ type: "CONCEDE" });
  });

  it("ignores permanents with missing definitions for ACTIVATE_ABILITY generation", () => {
    const state = createInitialGameState("p1", "p2", { id: "legal-9", rngSeed: "seed-legal-9" });
    state.turnState.phase = "MAIN_1";
    state.turnState.step = "MAIN_1";
    state.turnState.activePlayerId = "p1";
    setPriority(state, "p1");
    putOnBattlefield(state, "p1", {
      id: "obj-missing-def-battlefield",
      cardDefId: "missing-def-id"
    });

    const commands = getLegalCommands(state);

    expect(commands.some((command) => command.type === "ACTIVATE_ABILITY")).toBe(false);
    expect(commands).toContainEqual({ type: "PASS_PRIORITY" });
    expect(commands).toContainEqual({ type: "CONCEDE" });
  });
});
