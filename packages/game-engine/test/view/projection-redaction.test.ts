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

function createStateWithSecrets(): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "projection-redaction-test",
    rngSeed: "projection-redaction-seed"
  });

  addObject(
    state,
    createObject("viewer-hand", "p1", { kind: "hand", scope: "player", playerId: "p1" })
  );
  addObject(
    state,
    createObject("opponent-hand", "p2", { kind: "hand", scope: "player", playerId: "p2" })
  );
  addObject(
    state,
    createObject("battlefield-card", "p1", { kind: "battlefield", scope: "shared" })
  );

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

function getZoneCount(
  state: ReturnType<typeof projectPlayerView>,
  zone: ZoneRef
): number | undefined {
  return state.zones.find((entry) => {
    if (entry.zoneRef.kind !== zone.kind || entry.zoneRef.scope !== zone.scope) {
      return false;
    }

    if (zone.scope === "player" && entry.zoneRef.scope === "player") {
      return entry.zoneRef.playerId === zone.playerId;
    }

    return true;
  })?.count;
}

describe("view/projection redaction", () => {
  it("strips secret engine fields from the projected view", () => {
    const view = projectPlayerView(createStateWithSecrets(), "p1");

    expect("rngSeed" in view).toBe(false);
    expect("lkiStore" in view).toBe(false);
    expect("triggerQueue" in view).toBe(false);
    expect("continuousEffects" in view).toBe(false);
  });

  it("includes a pending choice only for the addressed player", () => {
    const state = createStateWithSecrets();

    expect(projectPlayerView(state, "p1").pendingChoice?.id).toBe("choice-1");
    expect(projectPlayerView(state, "p2").pendingChoice).toBeNull();
  });

  it("returns null pendingChoice when the engine state has none", () => {
    const state = createStateWithSecrets();
    state.pendingChoice = null;

    expect(projectPlayerView(state, "p1").pendingChoice).toBeNull();
  });

  it("maps phase, active player, and priority player into the turnState view", () => {
    const view = projectPlayerView(createStateWithSecrets(), "p1");

    expect(view.turnState).toEqual({
      phase: "MAIN_1",
      activePlayerId: "p1",
      priorityPlayerId: "p2"
    });
  });

  it("includes zone counts for player and public zones", () => {
    const view = projectPlayerView(createStateWithSecrets(), "p1");

    expect(getZoneCount(view, { kind: "hand", scope: "player", playerId: "p1" })).toBe(1);
    expect(getZoneCount(view, { kind: "hand", scope: "player", playerId: "p2" })).toBe(1);
    expect(getZoneCount(view, { kind: "battlefield", scope: "shared" })).toBe(1);
  });
});
