import { describe, expect, it } from "vitest";

import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import {
  createInitialGameState,
  type GameState,
  type PendingChoice
} from "../../src/state/gameState";
import type { GameObject } from "../../src/state/gameObject";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

function pendingYesNoChoice(): PendingChoice {
  return {
    id: "choice-yes-no",
    type: "CHOOSE_YES_NO",
    forPlayer: "p1",
    prompt: "Choose yes or no",
    constraints: { prompt: "Choose yes or no" }
  };
}

function buildPausedChoiceState(choice: PendingChoice): GameState {
  const state = createInitialGameState("p1", "p2", {
    id: "resume-test",
    rngSeed: "resume-seed"
  });
  const stackZone = state.mode.resolveZone(state, "stack", "p1");
  const stackZoneKey = zoneKey(stackZone);

  const object: GameObject = {
    id: "obj-stack-spell",
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

  state.objectPool.set(object.id, object);
  state.zones.set(stackZoneKey, [object.id]);
  state.stack = [
    {
      id: "stack-item-1",
      object: { id: object.id, zcc: object.zcc },
      controller: "p1",
      targets: [],
      effectContext: {
        stackItemId: "stack-item-1",
        source: { id: object.id, zcc: object.zcc },
        controller: "p1",
        targets: [],
        cursor: { kind: "waiting_choice", choiceId: choice.id },
        whiteboard: {
          actions: [],
          scratch: {
            resumeStepIndex: 1
          }
        }
      }
    }
  ];
  state.pendingChoice = choice;
  return state;
}

describe("choices/resume", () => {
  it("rejects non-choice commands while resolution is paused", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());

    expect(() => processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed))).toThrow(
      /only MAKE_CHOICE is allowed/
    );
  });

  it("resumes choice resolution from the next step on valid MAKE_CHOICE", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());

    const result = processCommand(
      state,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.stack).toHaveLength(0);
    expect(result.nextState.pendingChoice).toBeNull();
  });

  it("does not re-run previously completed steps during resumption", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());
    state.stack[0]!.effectContext.whiteboard.actions = [
      {
        id: "existing-action",
        type: "DRAW",
        source: null,
        controller: "p1",
        appliedReplacements: [],
        playerId: "p1",
        count: 1
      }
    ];

    const result = processCommand(
      state,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: false } },
      new Rng(state.rngSeed)
    );

    expect(result.nextState.stack).toHaveLength(0);
    expect(result.nextState.pendingChoice).toBeNull();
  });

  it("rejects MAKE_CHOICE payloads that violate constraints", () => {
    const state = buildPausedChoiceState({
      id: "choice-cards",
      type: "CHOOSE_CARDS",
      forPlayer: "p1",
      prompt: "Choose exactly one",
      constraints: {
        candidates: ["obj-a", "obj-b"],
        min: 1,
        max: 1
      }
    });

    expect(() =>
      processCommand(
        state,
        {
          type: "MAKE_CHOICE",
          payload: { type: "CHOOSE_CARDS", selected: ["obj-a", "obj-b"], min: 1, max: 1 }
        },
        new Rng(state.rngSeed)
      )
    ).toThrow(/selected more cards than maximum/);
  });

  it("rejects CHOOSE_CARDS payloads with duplicate card ids", () => {
    const state = buildPausedChoiceState({
      id: "choice-cards-dup",
      type: "CHOOSE_CARDS",
      forPlayer: "p1",
      prompt: "Choose exactly two",
      constraints: {
        candidates: ["obj-a", "obj-b"],
        min: 2,
        max: 2
      }
    });

    expect(() =>
      processCommand(
        state,
        {
          type: "MAKE_CHOICE",
          payload: { type: "CHOOSE_CARDS", selected: ["obj-a", "obj-a"], min: 2, max: 2 }
        },
        new Rng(state.rngSeed)
      )
    ).toThrow(/selected cards must be unique/);
  });

  it("rejects MAKE_CHOICE when no pendingChoice exists", () => {
    const state = createInitialGameState("p1", "p2", { id: "resume-no-choice", rngSeed: "seed" });

    expect(() =>
      processCommand(
        state,
        { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
        new Rng(state.rngSeed)
      )
    ).toThrow(/no pending choice/);
  });

  it("rejects MAKE_CHOICE from the wrong player", () => {
    const state = buildPausedChoiceState({
      ...pendingYesNoChoice(),
      forPlayer: "p2"
    });

    expect(() =>
      processCommand(
        state,
        { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
        new Rng(state.rngSeed)
      )
    ).toThrow(/only the pending choice player/);
  });

  it("rejects MAKE_CHOICE when stack is empty", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());
    state.stack = [];

    expect(() =>
      processCommand(
        state,
        { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
        new Rng(state.rngSeed)
      )
    ).toThrow(/without a stack item/);
  });

  it("rejects MAKE_CHOICE when stack cursor is not waiting_choice", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());
    state.stack[0]!.effectContext.cursor = { kind: "step", index: 1 };

    expect(() =>
      processCommand(
        state,
        { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
        new Rng(state.rngSeed)
      )
    ).toThrow(/not waiting for a choice/);
  });

  it("rejects MAKE_CHOICE when cursor choiceId does not match pending choice id", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());
    state.stack[0]!.effectContext.cursor = { kind: "waiting_choice", choiceId: "choice-other" };

    expect(() =>
      processCommand(
        state,
        { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
        new Rng(state.rngSeed)
      )
    ).toThrow(/does not match stack cursor choice id/);
  });

  it("preserves state invariants after choice resumption", () => {
    const state = buildPausedChoiceState(pendingYesNoChoice());

    const result = processCommand(
      state,
      { type: "MAKE_CHOICE", payload: { type: "CHOOSE_YES_NO", accepted: true } },
      new Rng(state.rngSeed)
    );

    expect(() => assertStateInvariants(result.nextState)).not.toThrow();
  });
});
