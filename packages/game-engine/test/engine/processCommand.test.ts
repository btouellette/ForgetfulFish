import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import {
  createInitialGameState,
  type GameState,
  type PendingChoice
} from "../../src/state/gameState";
import { type Command } from "../../src/commands/command";
import { Rng } from "../../src/rng/rng";
import { serializeGameState } from "../../src/state/serialization";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import {
  processCommand,
  type CommandResult,
  type CommandHandlerResult
} from "../../src/engine/processCommand";

const testInstantDefinition: CardDefinition = {
  id: "process-command-test-instant",
  name: "Process Command Test Instant",
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

const testDualManaLandDefinition: CardDefinition = {
  id: "process-command-test-dual-mana-land",
  name: "Process Command Test Dual Mana Land",
  manaCost: {},
  typeLine: ["Land"],
  subtypes: [],
  color: [],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [
    {
      kind: "activated",
      cost: [{ kind: "tap" }],
      effect: { kind: "add_mana", mana: { blue: 1 } },
      isManaAbility: true
    },
    {
      kind: "activated",
      cost: [{ kind: "tap" }],
      effect: { kind: "add_mana", mana: { red: 1 } },
      isManaAbility: true
    }
  ],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const testCreatureDefinition: CardDefinition = {
  id: "process-command-test-creature",
  name: "Process Command Test Creature",
  manaCost: { generic: 2 },
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

function createBattlefieldCreature(
  id: string,
  controller: "p1" | "p2",
  cardDefId = testCreatureDefinition.id
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: controller,
    controller,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "battlefield", scope: "shared" }
  };
}

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

function yesNoPendingChoice(forPlayer: "p1" | "p2"): PendingChoice {
  return {
    id: `choice-${forPlayer}-yes-no`,
    type: "CHOOSE_YES_NO",
    forPlayer,
    prompt: "Choose yes or no",
    constraints: { prompt: "Choose yes or no" }
  };
}

describe("engine/processCommand", () => {
  it("returns a valid CommandResult shape for PASS_PRIORITY", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-1", rngSeed: "seed-1" });
    const rng = new Rng(state.rngSeed);

    const result = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result.nextState).toBeDefined();
    expect(result.newEvents).toHaveLength(1);
    expect(result.newEvents[0]).toMatchObject({
      type: "PRIORITY_PASSED",
      playerId: "p1",
      seq: state.version + 1
    });
    expect(result.nextState.version).toBe(state.version + 1);
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

  it("rejects non-choice commands while pendingChoice exists", () => {
    const state = createInitialGameState("p1", "p2", { id: "game-4b", rngSeed: "seed-4b" });
    const stateWithChoice = {
      ...state,
      pendingChoice: yesNoPendingChoice("p1")
    };
    const rng = new Rng(stateWithChoice.rngSeed);

    expect(() => processCommand(stateWithChoice, { type: "PASS_PRIORITY" }, rng)).toThrow(
      /only MAKE_CHOICE or CONCEDE are allowed/
    );
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

    const playLandState = createInitialGameState("p1", "p2", { id: "game-6b", rngSeed: "seed-6b" });
    playLandState.turnState.phase = "MAIN_1";
    playLandState.turnState.step = "MAIN_1";
    playLandState.turnState.priorityState = createInitialPriorityState("p1");
    playLandState.players[0].priority = true;
    playLandState.players[1].priority = false;
    const land: GameObject = {
      id: "obj-1",
      zcc: 0,
      cardDefId: "island",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: true,
      attachments: [],
      abilities: [],
      zone: { kind: "hand", scope: "player", playerId: "p1" }
    };
    playLandState.objectPool.set(land.id, land);
    playLandState.players[0].hand.push(land.id);
    playLandState.zones
      .get(zoneKey({ kind: "hand", scope: "player", playerId: "p1" }))
      ?.push(land.id);

    const commands = [
      sampleCommand("CAST_SPELL"),
      sampleCommand("ACTIVATE_ABILITY"),
      sampleCommand("PASS_PRIORITY"),
      sampleCommand("MAKE_CHOICE"),
      sampleCommand("DECLARE_ATTACKERS"),
      sampleCommand("DECLARE_BLOCKERS"),
      sampleCommand("PLAY_LAND"),
      sampleCommand("CONCEDE")
    ];

    const outputs = commands.map(
      (command): CommandHandlerResult =>
        command.type === "PLAY_LAND"
          ? processCommand(playLandState, command, new Rng(playLandState.rngSeed))
          : command.type === "CAST_SPELL"
            ? (() => {
                const castState = createInitialGameState("p1", "p2", {
                  id: "game-6c",
                  rngSeed: "seed-6c"
                });
                castState.turnState.phase = "MAIN_1";
                castState.turnState.step = "MAIN_1";
                castState.turnState.priorityState = createInitialPriorityState("p1");
                castState.players[0].priority = true;
                castState.players[1].priority = false;
                castState.players[0].manaPool.blue = 1;
                cardRegistry.set(testInstantDefinition.id, testInstantDefinition);

                const spellObject: GameObject = {
                  id: "obj-1",
                  zcc: 0,
                  cardDefId: testInstantDefinition.id,
                  owner: "p1",
                  controller: "p1",
                  counters: new Map(),
                  damage: 0,
                  tapped: false,
                  summoningSick: false,
                  attachments: [],
                  abilities: [],
                  zone: { kind: "hand", scope: "player", playerId: "p1" }
                };
                castState.objectPool.set(spellObject.id, spellObject);
                castState.players[0].hand.push(spellObject.id);
                castState.zones
                  .get(zoneKey({ kind: "hand", scope: "player", playerId: "p1" }))
                  ?.push(spellObject.id);

                return processCommand(castState, command, new Rng(castState.rngSeed));
              })()
            : command.type === "ACTIVATE_ABILITY"
              ? (() => {
                  const activateState = createInitialGameState("p1", "p2", {
                    id: "game-6d",
                    rngSeed: "seed-6d"
                  });
                  const island: GameObject = {
                    id: "obj-1",
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
                    zone: { kind: "battlefield", scope: "shared" }
                  };
                  activateState.objectPool.set(island.id, island);
                  activateState.zones
                    .get(zoneKey({ kind: "battlefield", scope: "shared" }))
                    ?.push(island.id);

                  return processCommand(activateState, command, new Rng(activateState.rngSeed));
                })()
              : command.type === "MAKE_CHOICE"
                ? (() => {
                    const choiceState = createInitialGameState("p1", "p2", {
                      id: "game-6e",
                      rngSeed: "seed-6e"
                    });
                    const stackZone = choiceState.mode.resolveZone(choiceState, "stack", "p1");
                    const stackObject: GameObject = {
                      id: "obj-choice-stack",
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
                      zone: stackZone
                    };
                    const pendingChoice = yesNoPendingChoice("p1");
                    choiceState.objectPool.set(stackObject.id, stackObject);
                    choiceState.zones.set(zoneKey(stackZone), [stackObject.id]);
                    choiceState.stack = [
                      {
                        id: "stack-item-choice",
                        object: { id: stackObject.id, zcc: stackObject.zcc },
                        controller: "p1",
                        targets: [],
                        effectContext: {
                          stackItemId: "stack-item-choice",
                          source: { id: stackObject.id, zcc: stackObject.zcc },
                          controller: "p1",
                          targets: [],
                          cursor: { kind: "waiting_choice", choiceId: pendingChoice.id },
                          whiteboard: {
                            actions: [],
                            scratch: { resumeStepIndex: 0 }
                          }
                        }
                      }
                    ];
                    choiceState.pendingChoice = pendingChoice;
                    return processCommand(choiceState, command, new Rng(choiceState.rngSeed));
                  })()
                : command.type === "DECLARE_ATTACKERS"
                  ? (() => {
                      const declareAttackersState = createInitialGameState("p1", "p2", {
                        id: "game-6f",
                        rngSeed: "seed-6f"
                      });
                      declareAttackersState.turnState.phase = "DECLARE_ATTACKERS";
                      declareAttackersState.turnState.step = "DECLARE_ATTACKERS";
                      declareAttackersState.turnState.activePlayerId = "p1";
                      declareAttackersState.turnState.priorityState =
                        createInitialPriorityState("p1");
                      declareAttackersState.players[0].priority = true;
                      declareAttackersState.players[1].priority = false;
                      return processCommand(
                        declareAttackersState,
                        command,
                        new Rng(declareAttackersState.rngSeed)
                      );
                    })()
                  : command.type === "DECLARE_BLOCKERS"
                    ? (() => {
                        const declareBlockersState = createInitialGameState("p1", "p2", {
                          id: "game-6g",
                          rngSeed: "seed-6g"
                        });
                        const previousTestCreatureDefinition = cardRegistry.get(
                          testCreatureDefinition.id
                        );
                        cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);
                        try {
                          declareBlockersState.turnState.phase = "DECLARE_BLOCKERS";
                          declareBlockersState.turnState.step = "DECLARE_BLOCKERS";
                          declareBlockersState.turnState.activePlayerId = "p1";
                          const attacker = createBattlefieldCreature("obj-attacker", "p1");
                          declareBlockersState.objectPool.set(attacker.id, attacker);
                          declareBlockersState.zones
                            .get(zoneKey({ kind: "battlefield", scope: "shared" }))
                            ?.push(attacker.id);
                          declareBlockersState.turnState.attackers = [attacker.id];
                          declareBlockersState.turnState.priorityState =
                            createInitialPriorityState("p2");
                          declareBlockersState.players[0].priority = false;
                          declareBlockersState.players[1].priority = true;
                          return processCommand(
                            declareBlockersState,
                            command,
                            new Rng(declareBlockersState.rngSeed)
                          );
                        } finally {
                          if (previousTestCreatureDefinition === undefined) {
                            cardRegistry.delete(testCreatureDefinition.id);
                          } else {
                            cardRegistry.set(
                              testCreatureDefinition.id,
                              previousTestCreatureDefinition
                            );
                          }
                        }
                      })()
                    : processCommand(state, command, rng)
    );

    expect(outputs).toHaveLength(8);
  });

  it("activates Island mana ability via ACTIVATE_ABILITY command", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-8",
      rngSeed: "seed-8"
    });
    const island: GameObject = {
      id: "obj-activate-island",
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
      zone: { kind: "battlefield", scope: "shared" }
    };
    state.objectPool.set(island.id, island);
    state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(island.id);

    const result = processCommand(
      state,
      {
        type: "ACTIVATE_ABILITY",
        sourceId: island.id,
        abilityIndex: 0,
        targets: []
      },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.objectPool.get(island.id)?.tapped).toBe(true);
    expect(result.nextState.players[0].manaPool.blue).toBe(1);
    expect(result.newEvents[0]).toMatchObject({
      type: "ABILITY_ACTIVATED",
      controller: "p1"
    });
    expect(result.nextState.turnState.priorityState.activePlayerPassed).toBe(false);
    expect(result.nextState.turnState.priorityState.nonActivePlayerPassed).toBe(false);
  });

  it("uses ACTIVATE_ABILITY abilityIndex to choose mana output", () => {
    const previousCardDef = cardRegistry.get(testDualManaLandDefinition.id);

    try {
      cardRegistry.set(testDualManaLandDefinition.id, testDualManaLandDefinition);

      const state = createInitialGameState("p1", "p2", {
        id: "game-9",
        rngSeed: "seed-9"
      });
      const dualLand: GameObject = {
        id: "obj-dual-land",
        zcc: 0,
        cardDefId: testDualManaLandDefinition.id,
        owner: "p1",
        controller: "p1",
        counters: new Map(),
        damage: 0,
        tapped: false,
        summoningSick: false,
        attachments: [],
        abilities: [],
        zone: { kind: "battlefield", scope: "shared" }
      };
      state.objectPool.set(dualLand.id, dualLand);
      state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(dualLand.id);

      const result = processCommand(
        state,
        {
          type: "ACTIVATE_ABILITY",
          sourceId: dualLand.id,
          abilityIndex: 1,
          targets: []
        },
        new Rng(state.rngSeed)
      );

      expect(result.nextState.players[0].manaPool.red).toBe(1);
      expect(result.nextState.players[0].manaPool.blue).toBe(0);
    } finally {
      if (previousCardDef === undefined) {
        cardRegistry.delete(testDualManaLandDefinition.id);
      } else {
        cardRegistry.set(testDualManaLandDefinition.id, previousCardDef);
      }
    }
  });

  it("resets pass flags after ACTIVATE_ABILITY so both-passed does not carry over", () => {
    const base = createInitialGameState("p1", "p2", { id: "game-10", rngSeed: "seed-10" });
    const state: GameState = {
      ...base,
      turnState: {
        ...base.turnState,
        phase: "MAIN_1",
        step: "MAIN_1",
        activePlayerId: "p1",
        priorityState: {
          playerWithPriority: "p2",
          activePlayerPassed: true,
          nonActivePlayerPassed: false
        }
      },
      players: [
        { ...base.players[0], priority: false },
        { ...base.players[1], priority: true }
      ]
    };
    const island: GameObject = {
      id: "obj-p2-island",
      zcc: 0,
      cardDefId: "island",
      owner: "p2",
      controller: "p2",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "battlefield", scope: "shared" }
    };
    state.objectPool.set(island.id, island);
    state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(island.id);

    const activated = processCommand(
      state,
      {
        type: "ACTIVATE_ABILITY",
        sourceId: island.id,
        abilityIndex: 0,
        targets: []
      },
      new Rng(state.rngSeed)
    );
    const passed = processCommand(
      activated.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(activated.nextState.rngSeed)
    );

    expect(passed.nextState.turnState.step).toBe("MAIN_1");
    expect(passed.nextState.turnState.priorityState.playerWithPriority).toBe("p1");
  });

  it("advances from the fully-passed state snapshot, not stale priority flags", () => {
    const base = createInitialGameState("p1", "p2", { id: "game-7", rngSeed: "seed-7" });
    const state: GameState = {
      ...base,
      turnState: {
        ...base.turnState,
        phase: "END" as const,
        step: "END" as const,
        priorityState: {
          playerWithPriority: "p1",
          activePlayerPassed: false,
          nonActivePlayerPassed: true
        }
      },
      players: [
        { ...base.players[0], priority: true },
        { ...base.players[1], priority: false }
      ]
    };
    const rng = new Rng(state.rngSeed);

    const result = processCommand(state, { type: "PASS_PRIORITY" }, rng);

    expect(result.nextState.turnState.step).toBe("CLEANUP");
    expect(result.nextState.turnState.priorityState.activePlayerPassed).toBe(true);
    expect(result.nextState.turnState.priorityState.nonActivePlayerPassed).toBe(true);
  });

  it("marks the conceding player as lost and emits PLAYER_LOST", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "game-concede",
      rngSeed: "seed-concede"
    });
    const result = processCommand(
      state,
      {
        type: "CONCEDE",
        playerId: "p2"
      },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.players[1].hasLost).toBe(true);
    expect(result.newEvents).toHaveLength(1);
    expect(result.newEvents[0]).toMatchObject({
      type: "PLAYER_LOST",
      playerId: "p2",
      reason: "conceded"
    });
  });

  it("clears pendingChoice when a player concedes", () => {
    const baseState = createInitialGameState("p1", "p2", {
      id: "game-concede-pending-choice",
      rngSeed: "seed-concede-pending-choice"
    });
    const state: GameState = {
      ...baseState,
      pendingChoice: yesNoPendingChoice("p1")
    };

    const result = processCommand(
      state,
      {
        type: "CONCEDE",
        playerId: "p1"
      },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.pendingChoice).toBeNull();
    expect(result.pendingChoice).toBeNull();
  });

  it("allows the current empty DECLARE_BLOCKERS scaffolding path", () => {
    const previousCardDef = cardRegistry.get(testCreatureDefinition.id);

    try {
      cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

      const state = createInitialGameState("p1", "p2", {
        id: "game-blockers-empty",
        rngSeed: "seed-blockers-empty"
      });

      state.turnState.phase = "DECLARE_BLOCKERS";
      state.turnState.step = "DECLARE_BLOCKERS";
      state.turnState.activePlayerId = "p1";
      const attacker = createBattlefieldCreature("obj-attacker", "p1");
      state.objectPool.set(attacker.id, attacker);
      state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(attacker.id);
      state.turnState.attackers = [attacker.id];
      state.turnState.priorityState = createInitialPriorityState("p2");
      state.players[0].priority = false;
      state.players[1].priority = true;

      const result = processCommand(
        state,
        { type: "DECLARE_BLOCKERS", assignments: [] },
        new Rng(state.rngSeed)
      );

      expect(result.nextState.turnState.blockers).toEqual([]);
      expect(result.newEvents).toEqual([]);
    } finally {
      if (previousCardDef === undefined) {
        cardRegistry.delete(testCreatureDefinition.id);
      } else {
        cardRegistry.set(testCreatureDefinition.id, previousCardDef);
      }
    }
  });

  it("accepts a legal specific blocker assignment", () => {
    const previousCardDef = cardRegistry.get(testCreatureDefinition.id);

    try {
      cardRegistry.set(testCreatureDefinition.id, testCreatureDefinition);

      const state = createInitialGameState("p1", "p2", {
        id: "game-blockers-assignment",
        rngSeed: "seed-blockers-assignment"
      });

      state.turnState.phase = "DECLARE_BLOCKERS";
      state.turnState.step = "DECLARE_BLOCKERS";
      state.turnState.activePlayerId = "p1";
      const attacker = createBattlefieldCreature("obj-attacker", "p1");
      state.objectPool.set(attacker.id, attacker);
      state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(attacker.id);
      state.turnState.attackers = [attacker.id];
      state.turnState.priorityState = createInitialPriorityState("p2");
      state.players[0].priority = false;
      state.players[1].priority = true;

      const blocker = createBattlefieldCreature("obj-blocker", "p2");
      state.objectPool.set(blocker.id, blocker);
      state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(blocker.id);

      const result = processCommand(
        state,
        {
          type: "DECLARE_BLOCKERS",
          assignments: [{ attackerId: attacker.id, blockerIds: [blocker.id] }]
        },
        new Rng(state.rngSeed)
      );

      expect(result.nextState.turnState.blockers).toEqual([
        { attackerId: attacker.id, blockerId: blocker.id }
      ]);
    } finally {
      if (previousCardDef === undefined) {
        cardRegistry.delete(testCreatureDefinition.id);
      } else {
        cardRegistry.set(testCreatureDefinition.id, previousCardDef);
      }
    }
  });
});
