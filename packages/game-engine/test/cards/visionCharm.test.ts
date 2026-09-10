import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import { visionCharmCardDefinition } from "../../src/cards/vision-charm";
import { computeGameObject } from "../../src/effects/continuous/layers";
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

function putOnBattlefield(state: GameState, object: GameObject): void {
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
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

function sharedZone(state: GameState, kind: "library" | "graveyard"): string[] {
  return state.zones.get(zoneKey({ kind, scope: "shared" })) ?? [];
}

function resolveTopSpellByPassing(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(pass1.nextState, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
}

function createVisionCharmState(options?: { libraryCount?: number }) {
  cardRegistry.set(visionCharmCardDefinition.id, visionCharmCardDefinition);

  const state = createInitialGameState("p1", "p2", { id: "vc-test", rngSeed: "vc-seed" });
  setMainPhasePriority(state, "p1");
  setBlueMana(state, "p1", 2);

  putInHand(
    state,
    "p1",
    makeCard("obj-vc-cast", visionCharmCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );

  putOnBattlefield(
    state,
    makeCard("obj-permanent", "island", "p2", { kind: "battlefield", scope: "shared" })
  );

  for (let index = 0; index < (options?.libraryCount ?? 10); index += 1) {
    addToSharedZone(
      state,
      "library",
      makeCard(`obj-lib-${index}`, "island", "p1", { kind: "library", scope: "shared" })
    );
  }

  return state;
}

function castVisionCharm(state: GameState): ReturnType<typeof processCommand> {
  const cast = processCommand(
    state,
    {
      type: "CAST_SPELL",
      cardId: "obj-vc-cast",
      targets: [{ kind: "object", object: { id: "obj-permanent", zcc: 0 } }]
    },
    new Rng(state.rngSeed)
  );

  return resolveTopSpellByPassing(cast.nextState);
}

function chooseMode(
  result: ReturnType<typeof processCommand>,
  modeId: string
): ReturnType<typeof processCommand> {
  return processCommand(
    result.nextState,
    { type: "MAKE_CHOICE", payload: { type: "CHOOSE_MODE", mode: { id: modeId } } },
    new Rng(result.nextState.rngSeed)
  );
}

describe("cards/vision-charm", () => {
  it("loads as a 1-mana blue instant", () => {
    expect(visionCharmCardDefinition.name).toBe("Vision Charm");
    expect(visionCharmCardDefinition.manaCost).toEqual({ blue: 1 });
    expect(visionCharmCardDefinition.typeLine).toEqual(["Instant"]);
  });

  it("offers its modes when it resolves", () => {
    const state = createVisionCharmState();
    const resolved = castVisionCharm(state);

    expect(resolved.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (resolved.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected a mode choice");
    }

    expect(resolved.pendingChoice.constraints.modes.map((mode) => mode.id)).toEqual([
      "mill",
      "land-type"
    ]);
  });

  it("mills exactly four cards into the shared graveyard on the mill mode", () => {
    const state = createVisionCharmState({ libraryCount: 10 });
    const resolved = castVisionCharm(state);
    const milled = chooseMode(resolved, "mill");

    expect(sharedZone(milled.nextState, "library").length).toBe(6);
    expect(sharedZone(milled.nextState, "graveyard")).toEqual([
      "obj-lib-0",
      "obj-lib-1",
      "obj-lib-2",
      "obj-lib-3",
      "obj-vc-cast"
    ]);
  });

  it("does not ask for a land type on the mill mode", () => {
    const state = createVisionCharmState();
    const resolved = castVisionCharm(state);
    const milled = chooseMode(resolved, "mill");

    expect(milled.nextState.pendingChoice).toBeNull();
  });

  it("asks for a basic land type on the land-type mode", () => {
    const state = createVisionCharmState();
    const resolved = castVisionCharm(state);
    const modeChosen = chooseMode(resolved, "land-type");

    expect(modeChosen.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (modeChosen.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected a land type choice");
    }

    expect(modeChosen.pendingChoice.constraints.modes.map((mode) => mode.id)).toEqual([
      "Plains",
      "Island",
      "Swamp",
      "Mountain",
      "Forest"
    ]);
  });

  it("makes the target permanent the chosen basic land type until end of turn", () => {
    const state = createVisionCharmState();
    const resolved = castVisionCharm(state);
    const modeChosen = chooseMode(resolved, "land-type");
    const landTypeChosen = chooseMode(modeChosen, "Swamp");

    expect(
      computeGameObject("obj-permanent", landTypeChosen.nextState).subtypes.map(
        (subtype) => subtype.value
      )
    ).toContain("Swamp");
    expect(
      landTypeChosen.nextState.continuousEffects.some(
        (effect) =>
          effect.duration === "until_end_of_turn" &&
          effect.appliesTo.kind === "object" &&
          effect.appliesTo.object.id === "obj-permanent" &&
          effect.effect.kind === "type_change"
      )
    ).toBe(true);
  });

  it("does not mill on the land-type mode", () => {
    const state = createVisionCharmState({ libraryCount: 10 });
    const resolved = castVisionCharm(state);
    const modeChosen = chooseMode(resolved, "land-type");
    const landTypeChosen = chooseMode(modeChosen, "Swamp");

    expect(sharedZone(landTypeChosen.nextState, "library").length).toBe(10);
  });

  it("keeps state invariants after either mode", () => {
    const millState = createVisionCharmState();
    const milled = chooseMode(castVisionCharm(millState), "mill");
    expect(() => assertStateInvariants(milled.nextState)).not.toThrow();

    const landState = createVisionCharmState();
    const landTypeChosen = chooseMode(chooseMode(castVisionCharm(landState), "land-type"), "Swamp");
    expect(() => assertStateInvariants(landTypeChosen.nextState)).not.toThrow();
  });
});
