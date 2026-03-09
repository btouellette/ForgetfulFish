import { describe, expect, it } from "vitest";

import { accumulatedKnowledgeCardDefinition } from "../../src/cards/accumulated-knowledge";
import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

function makeCard(
  id: string,
  cardDefId: string,
  owner: "p1" | "p2",
  zone: GameObject["zone"]
): GameObject {
  return {
    id,
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
    zone
  };
}

function setMainPhasePriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = playerId;
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function setBlueMana(state: GameState, playerId: "p1" | "p2", amount: number): void {
  const player = playerId === "p1" ? state.players[0] : state.players[1];
  player.manaPool = { ...player.manaPool, blue: amount };
}

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  state.zones.set(handKey, [...(state.zones.get(handKey) ?? []), object.id]);
}

function addToSharedZone(
  state: GameState,
  kind: "library" | "graveyard",
  object: GameObject
): void {
  const zone = { kind, scope: "shared" } as const;
  const key = zoneKey(zone);
  state.objectPool.set(object.id, object);
  state.zones.set(key, [...(state.zones.get(key) ?? []), object.id]);
}

function resolveTopSpellByPassing(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(pass1.nextState, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
}

function createAccumulatedKnowledgeState(options?: {
  graveyardCount?: number;
  libraryCount?: number;
  graveyardOwner?: "p1" | "p2";
}) {
  cardRegistry.set(accumulatedKnowledgeCardDefinition.id, accumulatedKnowledgeCardDefinition);

  const state = createInitialGameState("p1", "p2", { id: "ak-test", rngSeed: "ak-seed" });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 3);

  const akInHand = makeCard("obj-ak-cast", accumulatedKnowledgeCardDefinition.id, "p1", {
    kind: "hand",
    scope: "player",
    playerId: "p1"
  });
  putInHand(state, "p1", akInHand);

  const graveyardCount = options?.graveyardCount ?? 0;
  for (let index = 0; index < graveyardCount; index += 1) {
    const owner = options?.graveyardOwner ?? "p1";
    addToSharedZone(
      state,
      "graveyard",
      makeCard(`obj-ak-gy-${index}`, accumulatedKnowledgeCardDefinition.id, owner, {
        kind: "graveyard",
        scope: "shared"
      })
    );
  }

  const libraryCount = options?.libraryCount ?? 5;
  for (let index = 0; index < libraryCount; index += 1) {
    addToSharedZone(
      state,
      "library",
      makeCard(`obj-lib-${index}`, "island", "p1", { kind: "library", scope: "shared" })
    );
  }

  return state;
}

describe("cards/accumulated-knowledge", () => {
  it("loads with correct name and mana cost", () => {
    expect(accumulatedKnowledgeCardDefinition.name).toBe("Accumulated Knowledge");
    expect(accumulatedKnowledgeCardDefinition.manaCost).toEqual({ blue: 1, generic: 1 });
  });

  it("can be cast when enough mana is available", () => {
    const state = createAccumulatedKnowledgeState();

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );

    expect(cast.nextState.stack.some((item) => item.object.id === "obj-ak-cast")).toBe(true);
  });

  it("draws exactly 1 card when no AK is in graveyard", () => {
    const state = createAccumulatedKnowledgeState({ graveyardCount: 0, libraryCount: 4 });
    const startingHand = state.players[0].hand.length;

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = resolveTopSpellByPassing(cast.nextState);

    expect(resolved.nextState.players[0].hand.length).toBe(startingHand);
  });

  it("second AK cast draws exactly 2 cards", () => {
    const state = createAccumulatedKnowledgeState({ graveyardCount: 0, libraryCount: 8 });
    const secondAk = makeCard("obj-ak-second", accumulatedKnowledgeCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    });
    putInHand(state, "p1", secondAk);

    const firstCast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );
    const firstResolved = resolveTopSpellByPassing(firstCast.nextState);

    setBlueMana(firstResolved.nextState, "p1", 3);
    setMainPhasePriority(firstResolved.nextState, "p1");

    const handBeforeSecond = firstResolved.nextState.players[0].hand.length;
    const secondCast = processCommand(
      firstResolved.nextState,
      { type: "CAST_SPELL", cardId: "obj-ak-second", targets: [] },
      new Rng(firstResolved.nextState.rngSeed)
    );
    const secondResolved = resolveTopSpellByPassing(secondCast.nextState);

    expect(secondResolved.nextState.players[0].hand.length).toBe(handBeforeSecond + 1);
  });

  it("counts AKs from all players in shared graveyard", () => {
    const state = createAccumulatedKnowledgeState({
      graveyardCount: 1,
      graveyardOwner: "p2",
      libraryCount: 5
    });
    const handBefore = state.players[0].hand.length;

    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = resolveTopSpellByPassing(cast.nextState);

    expect(resolved.nextState.players[0].hand.length).toBe(handBefore + 1);
  });

  it("counts only matching card definition ids in graveyard", () => {
    const alternateAccumulatedKnowledge: CardDefinition = {
      ...accumulatedKnowledgeCardDefinition,
      id: "accumulated-knowledge-alt"
    };
    const hadPrevious = cardRegistry.has(alternateAccumulatedKnowledge.id);
    const previousDefinition = hadPrevious
      ? cardRegistry.get(alternateAccumulatedKnowledge.id)
      : undefined;

    try {
      cardRegistry.set(alternateAccumulatedKnowledge.id, alternateAccumulatedKnowledge);

      const state = createAccumulatedKnowledgeState({ graveyardCount: 0, libraryCount: 5 });
      addToSharedZone(
        state,
        "graveyard",
        makeCard("obj-ak-alt-gy", alternateAccumulatedKnowledge.id, "p2", {
          kind: "graveyard",
          scope: "shared"
        })
      );
      const handBefore = state.players[0].hand.length;

      const cast = processCommand(
        state,
        { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
        new Rng(state.rngSeed)
      );
      const resolved = resolveTopSpellByPassing(cast.nextState);

      expect(resolved.nextState.players[0].hand.length).toBe(handBefore);
    } finally {
      if (hadPrevious && previousDefinition !== undefined) {
        cardRegistry.set(alternateAccumulatedKnowledge.id, previousDefinition);
      } else {
        cardRegistry.delete(alternateAccumulatedKnowledge.id);
      }
    }
  });

  it("does not count itself while resolving on the stack", () => {
    const state = createAccumulatedKnowledgeState({ graveyardCount: 0, libraryCount: 3 });
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = resolveTopSpellByPassing(cast.nextState);

    const drawnEventCount = resolved.newEvents.filter(
      (event) => event.type === "CARD_DRAWN"
    ).length;
    expect(drawnEventCount).toBe(1);
  });

  it("draws only available cards when library has fewer than requested", () => {
    const state = createAccumulatedKnowledgeState({ graveyardCount: 1, libraryCount: 1 });
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = resolveTopSpellByPassing(cast.nextState);

    expect(resolved.nextState.players[0].hasLost).toBe(true);
    expect(resolved.newEvents.some((event) => event.type === "PLAYER_LOST")).toBe(true);
  });

  it("preserves invariants after Accumulated Knowledge resolution", () => {
    const state = createAccumulatedKnowledgeState({ graveyardCount: 1, libraryCount: 5 });
    const cast = processCommand(
      state,
      { type: "CAST_SPELL", cardId: "obj-ak-cast", targets: [] },
      new Rng(state.rngSeed)
    );
    const resolved = resolveTopSpellByPassing(cast.nextState);

    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
