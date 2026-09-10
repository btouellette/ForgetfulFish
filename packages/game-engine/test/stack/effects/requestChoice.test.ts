import { describe, expect, it } from "vitest";

import { requestChoice } from "../../../src/stack/effects/choices";
import type { PauseResult, ResolveEffectHandlerContext } from "../../../src/stack/effects/types";
import type { StackItem } from "../../../src/stack/stackItem";

function makeStackItem(scratch: Record<string, unknown> = {}): StackItem {
  const source = { id: "obj-1", zcc: 0 };
  return {
    id: "stack-1",
    object: source,
    controller: "p1",
    targets: [],
    effectContext: {
      stackItemId: "stack-1",
      source,
      controller: "p1",
      targets: [],
      cursor: { kind: "start" },
      whiteboard: { actions: [], scratch }
    }
  };
}

function makeContext(stackItem: StackItem): {
  context: ResolveEffectHandlerContext;
  pauses: Array<{ choice: NonNullable<PauseResult["pendingChoice"]>; updatedTopItem: StackItem }>;
} {
  const pauses: Array<{
    choice: NonNullable<PauseResult["pendingChoice"]>;
    updatedTopItem: StackItem;
  }> = [];
  const context = {
    stackItem,
    path: [3],
    pauseWithChoice: (
      choice: NonNullable<PauseResult["pendingChoice"]>,
      updatedTopItem: StackItem
    ): PauseResult => {
      pauses.push({ choice, updatedTopItem });
      return { state: {}, events: [], pendingChoice: choice } as unknown as PauseResult;
    }
  } as unknown as ResolveEffectHandlerContext;

  return { context, pauses };
}

describe("stack/effects/requestChoice", () => {
  it("pauses with a pending choice on the first pass and records resume bookkeeping", () => {
    const stackItem = makeStackItem();
    const { context, pauses } = makeContext(stackItem);

    const outcome = requestChoice(context, {
      type: "CHOOSE_CARDS",
      storeKey: "brainstorm:selected",
      prompt: "Choose 2 cards",
      constraints: { candidates: ["a", "b", "c"], min: 2, max: 2 },
      idSuffix: "choose-cards"
    });

    expect(outcome.kind).toBe("paused");
    expect(pauses).toHaveLength(1);
    const [pause] = pauses;
    expect(pause.choice).toEqual({
      id: "stack-1:brainstorm:selected:choose-cards",
      type: "CHOOSE_CARDS",
      forPlayer: "p1",
      prompt: "Choose 2 cards",
      constraints: { candidates: ["a", "b", "c"], min: 2, max: 2 }
    });
    expect(pause.updatedTopItem.effectContext.cursor).toEqual({
      kind: "waiting_choice",
      choiceId: "stack-1:brainstorm:selected:choose-cards",
      resumePath: [3],
      phase: "effects"
    });
    expect(pause.updatedTopItem.effectContext.whiteboard.scratch).toEqual({
      "brainstorm:selected:choiceId": "stack-1:brainstorm:selected:choose-cards"
    });
  });

  it("returns the stored payload on the resuming pass", () => {
    const choiceId = "stack-1:brainstorm:selected:choose-cards";
    const stackItem = makeStackItem({
      "brainstorm:selected:choiceId": choiceId,
      [`choice:${choiceId}`]: { type: "CHOOSE_CARDS", selected: ["a", "b"], min: 2, max: 2 }
    });
    const { context, pauses } = makeContext(stackItem);

    const outcome = requestChoice(context, {
      type: "CHOOSE_CARDS",
      storeKey: "brainstorm:selected",
      prompt: "Choose 2 cards",
      constraints: { candidates: ["a", "b", "c"], min: 2, max: 2 },
      idSuffix: "choose-cards"
    });

    expect(pauses).toHaveLength(0);
    expect(outcome).toEqual({
      kind: "answered",
      payload: { type: "CHOOSE_CARDS", selected: ["a", "b"], min: 2, max: 2 }
    });
  });

  it("rejects a payload of the wrong choice type", () => {
    const choiceId = "stack-1:predict:named:name-card";
    const stackItem = makeStackItem({
      "predict:named:choiceId": choiceId,
      [`choice:${choiceId}`]: { type: "CHOOSE_CARDS", selected: ["a"], min: 1, max: 1 }
    });
    const { context } = makeContext(stackItem);

    expect(() =>
      requestChoice(context, {
        type: "NAME_CARD",
        storeKey: "predict:named",
        prompt: "Name a card",
        constraints: {},
        idSuffix: "name-card"
      })
    ).toThrow(/malformed NAME_CARD payload in scratch state for 'predict:named'/);
  });

  it("rejects duplicate ids in card selections and orderings", () => {
    const chooseId = "stack-1:selected:choose-cards";
    const chooseContext = makeContext(
      makeStackItem({
        "selected:choiceId": chooseId,
        [`choice:${chooseId}`]: { type: "CHOOSE_CARDS", selected: ["a", "a"], min: 2, max: 2 }
      })
    ).context;

    expect(() =>
      requestChoice(chooseContext, {
        type: "CHOOSE_CARDS",
        storeKey: "selected",
        prompt: "Choose 2 cards",
        constraints: { candidates: ["a", "b"], min: 2, max: 2 },
        idSuffix: "choose-cards"
      })
    ).toThrow(/unique cards/);

    const orderId = "stack-1:ordered:order-cards";
    const orderContext = makeContext(
      makeStackItem({
        "ordered:choiceId": orderId,
        [`choice:${orderId}`]: { type: "ORDER_CARDS", ordered: ["a", "a"] }
      })
    ).context;

    expect(() =>
      requestChoice(orderContext, {
        type: "ORDER_CARDS",
        storeKey: "ordered",
        prompt: "Order cards",
        constraints: { cards: ["a", "b"] },
        idSuffix: "order-cards"
      })
    ).toThrow(/unique cards/);
  });

  it("builds mode choices with their declared modes", () => {
    const { context, pauses } = makeContext(makeStackItem());

    requestChoice(context, {
      type: "CHOOSE_MODE",
      storeKey: "crystalSpray:mode",
      prompt: "Choose a land type",
      constraints: { modes: [{ id: "forest", label: "Forest" }] },
      idSuffix: "choose-mode"
    });

    expect(pauses[0].choice).toMatchObject({
      type: "CHOOSE_MODE",
      constraints: { modes: [{ id: "forest", label: "Forest" }] }
    });
  });
});
