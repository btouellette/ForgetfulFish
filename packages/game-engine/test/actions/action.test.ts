import { describe, expect, it } from "vitest";

import {
  ACTION_TYPES,
  type ActionType,
  type AddContinuousEffectAction,
  type AddManaAction,
  type CounterAction,
  type CreateTokenAction,
  type DealDamageAction,
  type DestroyAction,
  type DrawAction,
  type GainLifeAction,
  type GameAction,
  type LoseLifeAction,
  type MoveZoneAction,
  type SetControlAction,
  type ShuffleAction,
  type TapAction,
  type UntapAction
} from "../../src/actions/action";

function createBaseActionFields() {
  return {
    source: { id: "source-1", zcc: 0 },
    controller: "p1",
    appliedReplacements: [] as string[]
  };
}

function sampleActions(): GameAction[] {
  const drawAction: DrawAction = {
    ...createBaseActionFields(),
    id: "action-draw",
    type: "DRAW",
    playerId: "p1",
    count: 1
  };

  const moveZoneAction: MoveZoneAction = {
    ...createBaseActionFields(),
    id: "action-move",
    type: "MOVE_ZONE",
    objectId: "obj-1",
    from: { kind: "library", scope: "shared" },
    to: { kind: "hand", scope: "player", playerId: "p1" },
    toIndex: 0
  };

  const dealDamageAction: DealDamageAction = {
    ...createBaseActionFields(),
    id: "action-damage",
    type: "DEAL_DAMAGE",
    amount: 3,
    target: { kind: "object", object: { id: "obj-2", zcc: 1 } }
  };

  const counterAction: CounterAction = {
    ...createBaseActionFields(),
    id: "action-counter",
    type: "COUNTER",
    object: { id: "obj-3", zcc: 2 }
  };

  const setControlAction: SetControlAction = {
    ...createBaseActionFields(),
    id: "action-control",
    type: "SET_CONTROL",
    objectId: "obj-4",
    to: "p2",
    duration: "until_end_of_turn"
  };

  const destroyAction: DestroyAction = {
    ...createBaseActionFields(),
    id: "action-destroy",
    type: "DESTROY",
    objectId: "obj-5"
  };

  const tapAction: TapAction = {
    ...createBaseActionFields(),
    id: "action-tap",
    type: "TAP",
    objectId: "obj-6"
  };

  const untapAction: UntapAction = {
    ...createBaseActionFields(),
    id: "action-untap",
    type: "UNTAP",
    objectId: "obj-7"
  };

  const addManaAction: AddManaAction = {
    ...createBaseActionFields(),
    id: "action-add-mana",
    type: "ADD_MANA",
    playerId: "p1",
    mana: { blue: 1 }
  };

  const loseLifeAction: LoseLifeAction = {
    ...createBaseActionFields(),
    id: "action-lose-life",
    type: "LOSE_LIFE",
    playerId: "p1",
    amount: 2
  };

  const gainLifeAction: GainLifeAction = {
    ...createBaseActionFields(),
    id: "action-gain-life",
    type: "GAIN_LIFE",
    playerId: "p1",
    amount: 2
  };

  const addContinuousEffectAction: AddContinuousEffectAction = {
    ...createBaseActionFields(),
    id: "action-add-continuous-effect",
    type: "ADD_CONTINUOUS_EFFECT",
    effect: {
      id: "effect-1",
      source: { id: "source-1", zcc: 0 },
      layer: 2,
      duration: "until_end_of_turn",
      appliesTo: { kind: "object", object: { id: "obj-4", zcc: 0 } },
      effect: {
        kind: "set_controller",
        payload: { playerId: "p2" }
      }
    }
  };

  const createTokenAction: CreateTokenAction = {
    ...createBaseActionFields(),
    id: "action-create-token",
    type: "CREATE_TOKEN",
    tokenDefId: "token-drake",
    controller: "p1",
    zone: { kind: "battlefield", scope: "shared" }
  };

  const shuffleAction: ShuffleAction = {
    ...createBaseActionFields(),
    id: "action-shuffle",
    type: "SHUFFLE",
    zone: { kind: "library", scope: "shared" }
  };

  return [
    drawAction,
    moveZoneAction,
    dealDamageAction,
    counterAction,
    setControlAction,
    destroyAction,
    tapAction,
    untapAction,
    addManaAction,
    loseLifeAction,
    gainLifeAction,
    addContinuousEffectAction,
    createTokenAction,
    shuffleAction
  ];
}

function assertExhaustive(action: GameAction): ActionType {
  switch (action.type) {
    case "DRAW":
    case "MOVE_ZONE":
    case "DEAL_DAMAGE":
    case "COUNTER":
    case "SET_CONTROL":
    case "DESTROY":
    case "TAP":
    case "UNTAP":
    case "ADD_MANA":
    case "LOSE_LIFE":
    case "GAIN_LIFE":
    case "ADD_CONTINUOUS_EFFECT":
    case "CREATE_TOKEN":
    case "SHUFFLE":
      return action.type;
    default: {
      const neverAction: never = action;
      return neverAction;
    }
  }
}

describe("actions/action", () => {
  it("exports ACTION_TYPES with all 14 variants", () => {
    expect(ACTION_TYPES).toHaveLength(14);
    expect(ACTION_TYPES).toContain("MOVE_ZONE");
  });

  it("constructs one action for each of the 14 action types", () => {
    const actions = sampleActions();

    expect(actions).toHaveLength(14);
    expect(new Set(actions.map((action) => action.type)).size).toBe(14);
  });

  it("ensures all action variants include base fields", () => {
    for (const action of sampleActions()) {
      expect(action.id).toBeTypeOf("string");
      expect(action.controller).toBeTypeOf("string");
      expect(Array.isArray(action.appliedReplacements)).toBe(true);
      expect(action.source).toEqual({ id: "source-1", zcc: 0 });
    }
  });

  it("narrows discriminated union for MoveZoneAction specific fields", () => {
    const action = sampleActions().find((candidate) => candidate.type === "MOVE_ZONE");

    if (!action || action.type !== "MOVE_ZONE") {
      throw new Error("expected MOVE_ZONE action");
    }

    expect(action.objectId).toBe("obj-1");
    expect(action.from.kind).toBe("library");
    expect(action.to.kind).toBe("hand");
    expect(action.toIndex).toBe(0);
  });

  it("initializes appliedReplacements as an empty array", () => {
    for (const action of sampleActions()) {
      expect(action.appliedReplacements).toEqual([]);
    }
  });

  it("supports unique ActionId values across action instances", () => {
    const ids = sampleActions().map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("enforces action variant exhaustiveness via never", () => {
    const seenTypes = sampleActions().map((action) => assertExhaustive(action));
    expect(seenTypes).toContain("SHUFFLE");
  });
});
