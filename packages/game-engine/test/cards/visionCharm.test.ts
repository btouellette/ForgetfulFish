import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { visionCharmCardDefinition } from "../../src/cards/vision-charm";
import { computeGameObject } from "../../src/effects/continuous/layers";
import { advanceStepWithEvents, advanceTurn } from "../../src/engine/kernel";
import { processCommand } from "../../src/engine/processCommand";
import type { GameMode } from "../../src/mode/gameMode";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey, type ZoneRef } from "../../src/state/zones";
import { OnResolveRegistry } from "../../src/stack/onResolveRegistry";
import { assertStateInvariants } from "../helpers/invariants";

const SHARED_LIBRARY: ZoneRef = { kind: "library", scope: "shared" };
const SHARED_GRAVEYARD: ZoneRef = { kind: "graveyard", scope: "shared" };
const SHARED_BATTLEFIELD: ZoneRef = { kind: "battlefield", scope: "shared" };

const artifactDefinition: CardDefinition = {
  id: "test-artifact",
  name: "Test Artifact",
  manaCost: { generic: 1 },
  rulesText: "",
  typeLine: ["Artifact"],
  subtypes: [],
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

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  state.zones.set(handKey, [...(state.zones.get(handKey) ?? []), object.id]);
}

function addToZone(state: GameState, zone: ZoneRef, object: GameObject): void {
  const key = zoneKey(zone);
  state.objectPool.set(object.id, object);
  state.zones.set(key, [...(state.zones.get(key) ?? []), object.id]);
}

function zoneIds(state: GameState, zone: ZoneRef): string[] {
  return state.zones.get(zoneKey(zone)) ?? [];
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

function passPriorityPair(state: GameState): ReturnType<typeof processCommand> {
  const pass1 = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(
    pass1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(pass1.nextState.rngSeed)
  );
}

function createVisionCharmState(options: { mode?: GameMode } = {}): GameState {
  cardRegistry.set(visionCharmCardDefinition.id, visionCharmCardDefinition);
  cardRegistry.set(artifactDefinition.id, artifactDefinition);
  const state = createInitialGameState("p1", "p2", {
    id: "vision-charm-test",
    rngSeed: "vision-charm-seed",
    ...(options.mode === undefined ? {} : { mode: options.mode })
  });
  setMainPhasePriority(state, "p1");
  state.players[0].manaPool = { ...state.players[0].manaPool, blue: 1 };

  putInHand(
    state,
    "p1",
    makeCard("obj-charm", visionCharmCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );

  const battlefield = state.mode.resolveZone(state, "battlefield", "p1");
  addToZone(state, battlefield, makeCard("obj-artifact", artifactDefinition.id, "p2", battlefield));
  addToZone(state, battlefield, makeCard("obj-island-p1", "island", "p1", battlefield));
  addToZone(state, battlefield, makeCard("obj-island-p2", "island", "p2", battlefield));

  return state;
}

function fillLibrary(state: GameState, playerId: "p1" | "p2", count: number): ZoneRef {
  const library = state.mode.resolveZone(state, "library", playerId);
  for (let index = 0; index < count; index += 1) {
    addToZone(
      state,
      library,
      makeCard(`obj-lib-${playerId}-${index}`, "island", playerId, library)
    );
  }

  return library;
}

function castAndResolve(
  state: GameState,
  targets: Array<
    | { kind: "player"; playerId: "p1" | "p2" }
    | { kind: "object"; object: { id: string; zcc: number } }
  >
): ReturnType<typeof processCommand> {
  const cast = processCommand(
    state,
    { type: "CAST_SPELL", cardId: "obj-charm", targets },
    new Rng(state.rngSeed)
  );
  return passPriorityPair(cast.nextState);
}

const splitZonesTestMode: GameMode = {
  id: "split-zones-test-vision-charm",
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
  simultaneousDrawOrder(drawCount, activePlayerId) {
    return Array.from({ length: drawCount }, () => activePlayerId);
  },
  determineOwner(playerId) {
    return playerId;
  }
};

describe("cards/vision-charm", () => {
  it("loads as a one-mana blue instant with three modes", () => {
    expect(visionCharmCardDefinition.id).toBe("vision-charm");
    expect(visionCharmCardDefinition.manaCost).toEqual({ blue: 1 });
    expect(visionCharmCardDefinition.typeLine).toEqual(["Instant"]);
    expect(visionCharmCardDefinition.onResolve[0]?.kind).toBe("modal");
  });

  it("is castable without targets because only some modes need one", () => {
    const registry = new OnResolveRegistry(visionCharmCardDefinition.onResolve);
    expect(registry.has("phase_out_target")).toBe(true);
    expect(registry.requiresObjectTargets()).toBe(false);
  });

  it("prompts the caster to choose one of three modes on resolution", () => {
    const state = createVisionCharmState();
    const resolved = castAndResolve(state, [{ kind: "player", playerId: "p2" }]);

    expect(resolved.pendingChoice?.type).toBe("CHOOSE_MODE");
    if (resolved.pendingChoice?.type !== "CHOOSE_MODE") {
      throw new Error("expected CHOOSE_MODE pending choice");
    }
    expect(resolved.pendingChoice.forPlayer).toBe("p1");
    expect(resolved.pendingChoice.constraints.modes.map((mode) => mode.id)).toEqual([
      "mill",
      "land-type",
      "phase-out"
    ]);
  });

  it("mills exactly four cards from the target player's library in shared-deck mode", () => {
    const state = createVisionCharmState();
    fillLibrary(state, "p2", 6);
    const resolved = castAndResolve(state, [{ kind: "player", playerId: "p2" }]);
    const milled = chooseMode(resolved, "mill");
    const next = milled.nextState;

    expect(milled.pendingChoice).toBeNull();
    expect(zoneIds(next, SHARED_LIBRARY)).toEqual(["obj-lib-p2-4", "obj-lib-p2-5"]);
    expect(zoneIds(next, SHARED_GRAVEYARD)).toEqual([
      "obj-lib-p2-0",
      "obj-lib-p2-1",
      "obj-lib-p2-2",
      "obj-lib-p2-3",
      "obj-charm"
    ]);
  });

  it("mills from the target player's own library in split-zone mode", () => {
    const state = createVisionCharmState({ mode: splitZonesTestMode });
    const p1Library = fillLibrary(state, "p1", 5);
    const p2Library = fillLibrary(state, "p2", 5);
    const resolved = castAndResolve(state, [{ kind: "player", playerId: "p2" }]);
    const milled = chooseMode(resolved, "mill");
    const next = milled.nextState;

    expect(zoneIds(next, p1Library)).toHaveLength(5);
    expect(zoneIds(next, p2Library)).toEqual(["obj-lib-p2-4"]);
    expect(zoneIds(next, { kind: "graveyard", scope: "player", playerId: "p2" })).toEqual([
      "obj-lib-p2-0",
      "obj-lib-p2-1",
      "obj-lib-p2-2",
      "obj-lib-p2-3"
    ]);
    expect(zoneIds(next, { kind: "graveyard", scope: "player", playerId: "p1" })).toEqual([
      "obj-charm"
    ]);
  });

  it("turns every land of the chosen type into the chosen basic land type until end of turn", () => {
    const state = createVisionCharmState();
    const resolved = castAndResolve(state, []);
    const chooseFrom = chooseMode(resolved, "land-type");

    expect(chooseFrom.pendingChoice?.type).toBe("CHOOSE_MODE");
    expect(chooseFrom.pendingChoice?.prompt).toContain("land type");
    const chooseTo = chooseMode(chooseFrom, "Island");
    expect(chooseTo.pendingChoice?.type).toBe("CHOOSE_MODE");
    const done = chooseMode(chooseTo, "Mountain");
    const next = done.nextState;

    expect(done.pendingChoice).toBeNull();
    expect(next.stack).toHaveLength(0);
    for (const objectId of ["obj-island-p1", "obj-island-p2"]) {
      const computed = computeGameObject(objectId, next);
      expect(computed.typeLine).toEqual(["Land"]);
      expect(computed.subtypes).toEqual([{ kind: "basic_land_type", value: "Mountain" }]);
    }
    expect(computeGameObject("obj-artifact", next).typeLine).toEqual(["Artifact"]);
    expect(next.continuousEffects).toHaveLength(2);

    const cleanupState: GameState = {
      ...next,
      turnState: { ...next.turnState, phase: "CLEANUP", step: "CLEANUP" }
    };
    const afterCleanup = advanceStepWithEvents(cleanupState, new Rng(cleanupState.rngSeed)).state;
    expect(afterCleanup.continuousEffects).toHaveLength(0);
    expect(computeGameObject("obj-island-p1", afterCleanup).subtypes).toEqual([
      { kind: "basic_land_type", value: "Island" }
    ]);
  });

  it("phases out the target artifact", () => {
    const state = createVisionCharmState();
    const resolved = castAndResolve(state, [
      { kind: "object", object: { id: "obj-artifact", zcc: 0 } }
    ]);
    const done = chooseMode(resolved, "phase-out");
    const next = done.nextState;

    expect(done.pendingChoice).toBeNull();
    expect(next.objectPool.get("obj-artifact")?.phasedOut).toBe(true);
    expect(zoneIds(next, SHARED_BATTLEFIELD)).toContain("obj-artifact");
    expect(next.objectPool.get("obj-island-p1")?.phasedOut).toBeUndefined();
  });

  it("phases the artifact back in during its controller's next untap step", () => {
    const state = createVisionCharmState();
    const resolved = castAndResolve(state, [
      { kind: "object", object: { id: "obj-artifact", zcc: 0 } }
    ]);
    const phasedOut = chooseMode(resolved, "phase-out").nextState;

    // p2 controls the artifact; p1 is active. Move to p2's turn and process its untap step.
    const p2Turn = advanceTurn(phasedOut);
    expect(p2Turn.turnState.activePlayerId).toBe("p2");
    expect(p2Turn.turnState.step).toBe("UNTAP");
    const afterUntap = advanceStepWithEvents(p2Turn, new Rng(p2Turn.rngSeed)).state;

    expect(afterUntap.objectPool.get("obj-artifact")?.phasedOut).toBe(false);
  });

  it("does not phase in during the non-controller's untap step", () => {
    const state = createVisionCharmState();
    const resolved = castAndResolve(state, [
      { kind: "object", object: { id: "obj-artifact", zcc: 0 } }
    ]);
    const phasedOut = chooseMode(resolved, "phase-out").nextState;

    const p1Untap: GameState = {
      ...phasedOut,
      turnState: { ...phasedOut.turnState, phase: "UNTAP", step: "UNTAP" }
    };
    const afterUntap = advanceStepWithEvents(p1Untap, new Rng(p1Untap.rngSeed)).state;

    expect(afterUntap.objectPool.get("obj-artifact")?.phasedOut).toBe(true);
  });

  it("fizzles a spell whose only target has phased out", () => {
    const state = createVisionCharmState();
    const resolved = castAndResolve(state, [
      { kind: "object", object: { id: "obj-artifact", zcc: 0 } }
    ]);
    const phasedOut = chooseMode(resolved, "phase-out").nextState;

    putInHand(
      phasedOut,
      "p1",
      makeCard("obj-charm-2", visionCharmCardDefinition.id, "p1", {
        kind: "hand",
        scope: "player",
        playerId: "p1"
      })
    );
    phasedOut.players[0].manaPool = { ...phasedOut.players[0].manaPool, blue: 1 };
    setMainPhasePriority(phasedOut, "p1");

    const cast = processCommand(
      phasedOut,
      {
        type: "CAST_SPELL",
        cardId: "obj-charm-2",
        targets: [{ kind: "object", object: { id: "obj-artifact", zcc: 0 } }]
      },
      new Rng(phasedOut.rngSeed)
    );
    const fizzled = passPriorityPair(cast.nextState);

    expect(fizzled.pendingChoice).toBeNull();
    expect(fizzled.nextState.stack).toHaveLength(0);
    expect(zoneIds(fizzled.nextState, SHARED_GRAVEYARD)).toContain("obj-charm-2");
  });

  it("preserves invariants after each mode", () => {
    for (const run of [
      () =>
        chooseMode(
          castAndResolve(createVisionCharmState(), [{ kind: "player", playerId: "p2" }]),
          "mill"
        ),
      () =>
        chooseMode(
          chooseMode(
            chooseMode(castAndResolve(createVisionCharmState(), []), "land-type"),
            "Island"
          ),
          "Mountain"
        ),
      () =>
        chooseMode(
          castAndResolve(createVisionCharmState(), [
            { kind: "object", object: { id: "obj-artifact", zcc: 0 } }
          ]),
          "phase-out"
        )
    ]) {
      const result = run();
      expect(result.pendingChoice).toBeNull();
      expect(() => assertStateInvariants(result.nextState)).not.toThrow();
    }
  });
});
