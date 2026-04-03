import { describe, expect, it } from "vitest";

import type { CardDefinition } from "../../src/cards/cardDefinition";
import { cardRegistry } from "../../src/cards";
import { processCommand } from "../../src/engine/processCommand";
import { computeGameObject } from "../../src/effects/continuous/layers";
import type { GameMode } from "../../src/mode/gameMode";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const mentalNoteDefinition: CardDefinition = {
  id: "mental-note",
  name: "Mental Note",
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

const merfolkOfThePearlTridentDefinition: CardDefinition = {
  id: "merfolk-of-the-pearl-trident",
  name: "Merfolk of the Pearl Trident",
  manaCost: { blue: 1 },
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Merfolk" }],
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

const hasteMerfolkDefinition: CardDefinition = {
  id: "haste-merfolk-cast-test",
  name: "Haste Merfolk",
  manaCost: { blue: 1 },
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Merfolk" }],
  color: ["blue"],
  supertypes: [],
  power: 1,
  toughness: 1,
  keywords: [{ kind: "keyword", keyword: "haste" }],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

const splitZonesTestMode: GameMode = {
  id: "split-zones-test-cast",
  resolveZone(_state, logicalZone, playerId) {
    if (logicalZone === "library" || logicalZone === "graveyard" || logicalZone === "hand") {
      if (playerId === undefined) {
        throw new Error("playerId required for split test mode");
      }

      return { kind: logicalZone, scope: "player", playerId };
    }

    return { kind: logicalZone, scope: "shared" };
  },
  createInitialZones(players) {
    const zoneCatalog = [
      { kind: "library", scope: "player", playerId: players[0] },
      { kind: "library", scope: "player", playerId: players[1] },
      { kind: "graveyard", scope: "player", playerId: players[0] },
      { kind: "graveyard", scope: "player", playerId: players[1] },
      { kind: "battlefield", scope: "shared" },
      { kind: "exile", scope: "shared" },
      { kind: "stack", scope: "shared" },
      { kind: "hand", scope: "player", playerId: players[0] },
      { kind: "hand", scope: "player", playerId: players[1] }
    ] as const;

    return {
      zoneCatalog: [...zoneCatalog],
      zones: new Map(zoneCatalog.map((zone) => [zoneKey(zone), []]))
    };
  },
  simultaneousDrawOrder(drawCount, activePlayerId, players) {
    const otherPlayerId = players[0] === activePlayerId ? players[1] : players[0];
    const order: string[] = [];
    for (let index = 0; index < drawCount; index += 1) {
      order.push(index % 2 === 0 ? activePlayerId : otherPlayerId);
    }

    return order;
  },
  determineOwner(playerId) {
    return playerId;
  }
};

function createCardObject(id: string, cardDefId: string, playerId: "p1" | "p2"): GameObject {
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

function setupPriorityAndMainPhase(state: GameState, playerWithPriority: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = "p1";
  state.turnState.priorityState = createInitialPriorityState(playerWithPriority);
  state.players[0].priority = state.players[0].id === playerWithPriority;
  state.players[1].priority = state.players[1].id === playerWithPriority;
}

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  state.zones.get(zoneKey({ kind: "hand", scope: "player", playerId }))?.push(object.id);
}

function withBlueMana(state: GameState, playerId: "p1" | "p2", amount: number): GameState {
  const index = playerId === "p1" ? 0 : 1;
  const nextPlayers: GameState["players"] =
    index === 0
      ? [
          { ...state.players[0], manaPool: { ...state.players[0].manaPool, blue: amount } },
          state.players[1]
        ]
      : [
          state.players[0],
          { ...state.players[1], manaPool: { ...state.players[1].manaPool, blue: amount } }
        ];

  return {
    ...state,
    players: nextPlayers
  };
}

describe("engine/cast", () => {
  it("casts Mental Note to stack and deducts mana", () => {
    cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

    const base = createInitialGameState("p1", "p2", { id: "cast-1", rngSeed: "seed-cast-1" });
    const state = withBlueMana(base, "p1", 1);
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-mental-note", "mental-note", "p1"));

    const result = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mental-note", targets: [] },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.stack).toHaveLength(1);
    expect(result.nextState.players[0].manaPool.blue).toBe(0);
    expect(result.newEvents[0]).toMatchObject({
      type: "SPELL_CAST",
      controller: "p1"
    });
  });

  it("resolves instant to graveyard after both players pass", () => {
    cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

    const base = createInitialGameState("p1", "p2", { id: "cast-2", rngSeed: "seed-cast-2" });
    const state = withBlueMana(base, "p1", 1);
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-mental-note", "mental-note", "p1"));

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mental-note", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstPass = processCommand(
      cast.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );
    const secondPass = processCommand(
      firstPass.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    const graveyard =
      secondPass.nextState.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];
    expect(secondPass.nextState.stack).toHaveLength(0);
    expect(graveyard).toContain("obj-mental-note");
    expect(secondPass.newEvents.some((event) => event.type === "SPELL_RESOLVED")).toBe(true);
    const eventTypes = secondPass.newEvents.map((event) => event.type);
    const priorityIndex = eventTypes.indexOf("PRIORITY_PASSED");
    const resolvedIndex = eventTypes.indexOf("SPELL_RESOLVED");
    expect(priorityIndex).not.toBe(-1);
    expect(resolvedIndex).not.toBe(-1);
    expect(priorityIndex).toBeLessThan(resolvedIndex);
    expect(secondPass.nextState.turnState.priorityState.playerWithPriority).toBe(
      secondPass.nextState.turnState.activePlayerId
    );
  });

  it("resolves creature to battlefield", () => {
    cardRegistry.set(merfolkOfThePearlTridentDefinition.id, merfolkOfThePearlTridentDefinition);

    const base = createInitialGameState("p1", "p2", { id: "cast-3", rngSeed: "seed-cast-3" });
    const state = withBlueMana(base, "p1", 1);
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-merfolk", "merfolk-of-the-pearl-trident", "p1"));

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-merfolk", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstPass = processCommand(
      cast.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );
    const secondPass = processCommand(
      firstPass.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    const battlefield =
      secondPass.nextState.zones.get(zoneKey({ kind: "battlefield", scope: "shared" })) ?? [];
    expect(battlefield).toContain("obj-merfolk");
    expect(secondPass.nextState.objectPool.get("obj-merfolk")?.summoningSick).toBe(true);
  });

  it("keeps native-haste creatures attack-ready through the computed view on entry", () => {
    cardRegistry.set(hasteMerfolkDefinition.id, hasteMerfolkDefinition);

    const base = createInitialGameState("p1", "p2", {
      id: "cast-haste-creature",
      rngSeed: "seed-cast-haste-creature"
    });
    const state = withBlueMana(base, "p1", 1);
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-haste-merfolk", hasteMerfolkDefinition.id, "p1"));

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-haste-merfolk", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstPass = processCommand(
      cast.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );
    const secondPass = processCommand(
      firstPass.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    expect(secondPass.nextState.objectPool.get("obj-haste-merfolk")?.summoningSick).toBe(true);
    expect(computeGameObject("obj-haste-merfolk", secondPass.nextState).summoningSick).toBe(false);
  });

  it("rejects cast with insufficient mana", () => {
    cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

    const state = createInitialGameState("p1", "p2", { id: "cast-4", rngSeed: "seed-cast-4" });
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-mental-note", "mental-note", "p1"));

    expect(() =>
      processCommand(
        state,
        { type: "CAST_SPELL", cardId: "obj-mental-note", targets: [] },
        new Rng(state.rngSeed)
      )
    ).toThrow("insufficient mana to cast spell");
  });

  it("resolves responder spell first when opponent responds", () => {
    cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

    const initial = createInitialGameState("p1", "p2", { id: "cast-5", rngSeed: "seed-cast-5" });
    let state = withBlueMana(initial, "p1", 1);
    state = withBlueMana(state, "p2", 1);
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-p1-note", "mental-note", "p1"));
    putInHand(state, "p2", createCardObject("obj-p2-note", "mental-note", "p2"));

    const p1Cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-p1-note", targets: [] },
      new Rng(state.rngSeed)
    );
    const p1PassAfterCast = processCommand(
      p1Cast.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );
    const p2Cast = processCommand(
      p1PassAfterCast.nextState,
      { type: "CAST_SPELL", cardId: "obj-p2-note", targets: [] },
      new Rng(state.rngSeed)
    );
    const pass1 = processCommand(
      p2Cast.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );
    const resolveResponder = processCommand(
      pass1.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    const graveyard =
      resolveResponder.nextState.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];
    expect(resolveResponder.nextState.stack).toHaveLength(1);
    expect(graveyard).toEqual(["obj-p2-note"]);
  });

  it("preserves invariants after cast and after resolution", () => {
    cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

    const base = createInitialGameState("p1", "p2", {
      id: "cast-6",
      rngSeed: "seed-cast-6",
      mode: splitZonesTestMode
    });
    const state = withBlueMana(base, "p1", 1);
    setupPriorityAndMainPhase(state, "p1");
    putInHand(state, "p1", createCardObject("obj-mental-note", "mental-note", "p1"));

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-mental-note", targets: [] },
      new Rng(state.rngSeed)
    );
    expect(() => assertStateInvariants(cast.nextState)).not.toThrow();

    const pass1 = processCommand(cast.nextState, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
    const resolved = processCommand(
      pass1.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    const p1Graveyard =
      resolved.nextState.zones.get(
        zoneKey({ kind: "graveyard", scope: "player", playerId: "p1" })
      ) ?? [];
    expect(p1Graveyard).toEqual(["obj-mental-note"]);
    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
