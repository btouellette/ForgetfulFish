import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { memoryLapseCardDefinition } from "../../src/cards/memory-lapse";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { bumpZcc, zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const mentalNoteDefinition: CardDefinition = {
  id: "mental-note-memory-lapse-test",
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

function makeSpell(id: string, cardDefId: string, playerId: "p1" | "p2"): GameObject {
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

function setMainPhasePriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = "p1";
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function setMana(state: GameState, playerId: "p1" | "p2", blue: number, colorless = 0): void {
  const player = playerId === "p1" ? state.players[0] : state.players[1];
  player.manaPool = { ...player.manaPool, blue, colorless };
}

function castAndResolveMemoryLapseScenario(initialSharedLibrary: string[] = []) {
  cardRegistry.set(memoryLapseCardDefinition.id, memoryLapseCardDefinition);
  cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

  const state = createInitialGameState("p1", "p2", { id: "memory-lapse", rngSeed: "seed-ml" });
  if (initialSharedLibrary.length > 0) {
    state.zones.set(zoneKey({ kind: "library", scope: "shared" }), [...initialSharedLibrary]);
  }
  setMainPhasePriority(state, "p1");
  setMana(state, "p1", 1);
  setMana(state, "p2", 2);

  putInHand(state, "p1", makeSpell("obj-p1-spell", mentalNoteDefinition.id, "p1"));
  putInHand(state, "p2", makeSpell("obj-ml", memoryLapseCardDefinition.id, "p2"));

  const castTarget = processCommand(
    state,
    { type: "CAST_SPELL", cardId: "obj-p1-spell", targets: [] },
    new Rng(state.rngSeed)
  );
  const targetRef = castTarget.nextState.stack[0]?.object;
  if (targetRef === undefined) {
    throw new Error("expected target spell on stack");
  }

  const passToP2 = processCommand(
    castTarget.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(state.rngSeed)
  );
  const castMemoryLapse = processCommand(
    passToP2.nextState,
    {
      type: "CAST_SPELL",
      cardId: "obj-ml",
      targets: [{ kind: "object", object: targetRef }]
    },
    new Rng(state.rngSeed)
  );

  const p2Pass = processCommand(
    castMemoryLapse.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(state.rngSeed)
  );
  const resolveMemoryLapse = processCommand(
    p2Pass.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(state.rngSeed)
  );

  return {
    initial: state,
    castTarget,
    castMemoryLapse,
    resolved: resolveMemoryLapse
  };
}

describe("cards/memory-lapse", () => {
  it("loads Memory Lapse with expected definition fields", () => {
    expect(memoryLapseCardDefinition.id).toBe("memory-lapse");
    expect(memoryLapseCardDefinition.manaCost).toEqual({ blue: 1, generic: 1 });
    expect(memoryLapseCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("can be cast targeting a spell on the stack", () => {
    const { castMemoryLapse } = castAndResolveMemoryLapseScenario();
    const top = castMemoryLapse.nextState.stack[castMemoryLapse.nextState.stack.length - 1];
    expect(top?.object.id).toBe("obj-ml");
    expect(top?.targets[0]).toMatchObject({ kind: "object" });
  });

  it("counters the target spell and moves it to top of shared library", () => {
    const { resolved } = castAndResolveMemoryLapseScenario();
    const sharedLibrary =
      resolved.nextState.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];

    expect(sharedLibrary[0]).toBe("obj-p1-spell");
    expect(resolved.nextState.stack).toHaveLength(0);
  });

  it("puts the countered spell at index 0 of the common library", () => {
    const { resolved } = castAndResolveMemoryLapseScenario(["existing-a", "existing-b"]);

    const nextLibrary =
      resolved.nextState.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];
    expect(nextLibrary[0]).toBe("obj-p1-spell");
  });

  it("moves Memory Lapse itself to shared graveyard after resolution", () => {
    const { resolved } = castAndResolveMemoryLapseScenario();
    const sharedGraveyard =
      resolved.nextState.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];

    expect(sharedGraveyard).toContain("obj-ml");
  });

  it("works when targeting a spell controlled by the same player", () => {
    cardRegistry.set(memoryLapseCardDefinition.id, memoryLapseCardDefinition);
    cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

    const state = createInitialGameState("p1", "p2", {
      id: "memory-lapse-own",
      rngSeed: "seed-own"
    });
    setMainPhasePriority(state, "p2");
    setMana(state, "p2", 3);
    putInHand(state, "p2", makeSpell("obj-own-spell", mentalNoteDefinition.id, "p2"));
    putInHand(state, "p2", makeSpell("obj-own-ml", memoryLapseCardDefinition.id, "p2"));

    const castTarget = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-own-spell", targets: [] },
      new Rng(state.rngSeed)
    );
    const targetRef = castTarget.nextState.stack[0]?.object;
    if (targetRef === undefined) {
      throw new Error("expected target reference");
    }

    const castMemoryLapse = processCommand(
      castTarget.nextState,
      {
        type: "CAST_SPELL",
        cardId: "obj-own-ml",
        targets: [{ kind: "object", object: targetRef }]
      },
      new Rng(state.rngSeed)
    );

    const passP2 = processCommand(
      castMemoryLapse.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );
    const resolve = processCommand(
      passP2.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    const castState = castMemoryLapse.nextState;
    const memoryLapseItem = castState.stack.find((item) => item.object.id === "obj-own-ml");
    expect(memoryLapseItem?.targets[0]).toEqual({ kind: "object", object: targetRef });

    const sharedLibrary =
      resolve.nextState.zones.get(zoneKey({ kind: "library", scope: "shared" })) ?? [];
    expect(sharedLibrary[0]).toBe("obj-own-spell");
  });

  it("fizzles when the target spell leaves the stack before resolution", () => {
    const scenario = castAndResolveMemoryLapseScenario();
    const state = scenario.castMemoryLapse.nextState;
    const stackKey = zoneKey(state.mode.resolveZone(state, "stack", "p1"));

    state.stack = state.stack.filter((item) => item.object.id !== "obj-p1-spell");
    state.zones.set(
      stackKey,
      (state.zones.get(stackKey) ?? []).filter((id) => id !== "obj-p1-spell")
    );
    const targetObject = state.objectPool.get("obj-p1-spell");
    if (targetObject !== undefined) {
      const graveyardZone = state.mode.resolveZone(state, "graveyard", targetObject.owner);
      const graveyardKey = zoneKey(graveyardZone);
      state.objectPool.set(targetObject.id, bumpZcc({ ...targetObject, zone: graveyardZone }));
      state.zones.set(graveyardKey, [...(state.zones.get(graveyardKey) ?? []), targetObject.id]);
    }

    const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
    const pass2 = processCommand(
      pass1.nextState,
      { type: "PASS_PRIORITY" },
      new Rng(state.rngSeed)
    );

    expect(pass2.newEvents.some((event) => event.type === "SPELL_COUNTERED")).toBe(true);
  });

  it("preserves invariants after Memory Lapse resolution", () => {
    const { resolved } = castAndResolveMemoryLapseScenario();
    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
