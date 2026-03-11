import { describe, expect, it } from "vitest";

import {
  createInitialGameState,
  projectPlayerView,
  zoneKey,
  type GameObject,
  type GameState,
  type PendingChoice,
  type PlayerId,
  type ZoneRef
} from "../../src/index";

function createObject(
  id: string,
  owner: PlayerId,
  zone: ZoneRef,
  overrides: Partial<GameObject> = {}
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId: `${id}-card`,
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone,
    ...overrides
  };
}

function addObject(state: GameState, object: GameObject): void {
  state.objectPool.set(object.id, object);
  const zoneEntries = state.zones.get(zoneKey(object.zone));

  if (!zoneEntries) {
    throw new Error(`Zone not initialized for object ${object.id}`);
  }

  zoneEntries.push(object.id);

  const zone = object.zone;

  if (zone.kind === "hand") {
    if (zone.scope !== "player") {
      throw new Error("hand zone must be player scoped");
    }

    const player = state.players.find((entry) => entry.id === zone.playerId);

    if (!player) {
      throw new Error(`Player ${zone.playerId} not initialized for object ${object.id}`);
    }

    player.hand.push(object.id);
  }
}

function createStateWithVisibleAndHiddenObjects(): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "projection-test",
    rngSeed: "projection-seed"
  });

  addObject(
    state,
    createObject("viewer-hand", "p1", { kind: "hand", scope: "player", playerId: "p1" })
  );
  addObject(
    state,
    createObject("opponent-hand", "p2", { kind: "hand", scope: "player", playerId: "p2" })
  );
  addObject(state, createObject("library-card", "p1", { kind: "library", scope: "shared" }));
  addObject(
    state,
    createObject("battlefield-card", "p1", { kind: "battlefield", scope: "shared" })
  );
  addObject(state, createObject("graveyard-card", "p2", { kind: "graveyard", scope: "shared" }));
  addObject(state, createObject("exile-card", "p1", { kind: "exile", scope: "shared" }));
  addObject(state, createObject("stack-card", "p1", { kind: "stack", scope: "shared" }));

  state.stack.push({
    id: "stack-item-1",
    object: { id: "stack-card", zcc: 0 },
    controller: "p1",
    targets: [],
    effectContext: {
      stackItemId: "stack-item-1",
      source: { id: "stack-card", zcc: 0 },
      controller: "p1",
      targets: [],
      cursor: { kind: "start" },
      whiteboard: { actions: [], scratch: {} }
    }
  });

  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.priorityState.playerWithPriority = "p2";
  state.lkiStore.set("viewer-hand:0", {
    ref: { id: "viewer-hand", zcc: 0 },
    zone: { kind: "hand", scope: "player", playerId: "p1" },
    base: state.objectPool.get("viewer-hand")!,
    derived: state.objectPool.get("viewer-hand")!
  });
  state.triggerQueue.push({ id: "trigger-1" });

  const choice: PendingChoice = {
    id: "choice-1",
    type: "CHOOSE_YES_NO",
    forPlayer: "p1",
    prompt: "Respond?",
    constraints: { prompt: "Respond?" }
  };
  state.pendingChoice = choice;

  return state;
}

describe("view/projection", () => {
  it("shows the viewer their own hand card details", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");

    expect(view.viewer.hand).toHaveLength(1);
    expect(view.viewer.hand[0]?.id).toBe("viewer-hand");
    expect(view.objectPool["viewer-hand"]?.cardDefId).toBe("viewer-hand-card");
  });

  it("hides opponent hand identities and only exposes the count", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");

    expect(view.opponent.handCount).toBe(1);
    expect(view.objectPool["opponent-hand"]).toBeUndefined();
    expect(view.viewer.hand.some((card) => card.id === "opponent-hand")).toBe(false);
  });

  it("hides shared library identities while keeping the count", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");
    const libraryZone = view.zones.find(
      (entry) => entry.zoneRef.kind === "library" && entry.zoneRef.scope === "shared"
    );

    expect(libraryZone?.count).toBe(1);
    expect(libraryZone?.objectIds).toBeUndefined();
    expect(view.objectPool["library-card"]).toBeUndefined();
  });

  it("includes battlefield, graveyard, exile, and stack objects in public views", () => {
    const view = projectPlayerView(createStateWithVisibleAndHiddenObjects(), "p1");

    expect(view.objectPool["battlefield-card"]?.zone.kind).toBe("battlefield");
    expect(view.objectPool["graveyard-card"]?.zone.kind).toBe("graveyard");
    expect(view.objectPool["exile-card"]?.zone.kind).toBe("exile");
    expect(view.objectPool["stack-card"]?.zone.kind).toBe("stack");
    expect(view.stack).toEqual([{ object: { id: "stack-card", zcc: 0 }, controller: "p1" }]);
  });
});
