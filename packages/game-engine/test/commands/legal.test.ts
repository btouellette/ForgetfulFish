import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { getLegalCommands } from "../../src/commands/validate";
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

  it("pendingChoice state only returns MAKE_CHOICE", () => {
    const base = createInitialGameState("p1", "p2", { id: "legal-3", rngSeed: "seed-legal-3" });
    const state: GameState = {
      ...base,
      pendingChoice: yesNoPendingChoice("p1")
    };

    const commands = getLegalCommands(state);

    expect(commands).toHaveLength(2);
    expect(commands).toEqual([
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: false } }
    ]);
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

  it("includes DECLARE_ATTACKERS/DECLARE_BLOCKERS on corresponding steps", () => {
    const attackersState = createInitialGameState("p1", "p2", {
      id: "legal-5a",
      rngSeed: "seed-legal-5a"
    });
    attackersState.turnState.phase = "DECLARE_ATTACKERS";
    attackersState.turnState.step = "DECLARE_ATTACKERS";
    attackersState.turnState.activePlayerId = "p1";
    setPriority(attackersState, "p1");

    const attackersCommands = getLegalCommands(attackersState);
    expect(attackersCommands.some((command) => command.type === "DECLARE_ATTACKERS")).toBe(true);

    const blockersState = createInitialGameState("p1", "p2", {
      id: "legal-5b",
      rngSeed: "seed-legal-5b"
    });
    blockersState.turnState.phase = "DECLARE_BLOCKERS";
    blockersState.turnState.step = "DECLARE_BLOCKERS";
    blockersState.turnState.activePlayerId = "p1";
    setPriority(blockersState, "p2");

    const blockersCommands = getLegalCommands(blockersState);
    expect(blockersCommands.some((command) => command.type === "DECLARE_BLOCKERS")).toBe(true);
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
