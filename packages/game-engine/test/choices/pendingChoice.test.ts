import { describe, expect, it } from "vitest";

import { CHOICE_TYPES } from "../../src/choices/pendingChoice";
import type {
  ChoiceConstraints,
  PendingChoice,
  PendingChoiceByType
} from "../../src/choices/pendingChoice";

function makePendingChoice<T extends PendingChoice["type"]>(
  type: T,
  constraints: ChoiceConstraints<T>
): PendingChoiceByType<T> {
  return {
    id: `choice-${type.toLowerCase()}`,
    type,
    forPlayer: "p1",
    prompt: `Resolve ${type}`,
    constraints
  };
}

function countRange(choice: PendingChoice): number {
  if (choice.type !== "CHOOSE_CARDS") {
    return 0;
  }

  return choice.constraints.max - choice.constraints.min;
}

describe("choices/pendingChoice", () => {
  it("exposes all supported choice types", () => {
    expect(CHOICE_TYPES).toEqual([
      "CHOOSE_CARDS",
      "CHOOSE_TARGET",
      "CHOOSE_MODE",
      "CHOOSE_YES_NO",
      "ORDER_CARDS",
      "ORDER_TRIGGERS",
      "CHOOSE_REPLACEMENT",
      "NAME_CARD"
    ]);
  });

  it("constructs all 8 PendingChoice variants with valid constraints", () => {
    const pendingChoices: PendingChoice[] = [
      makePendingChoice("CHOOSE_CARDS", { candidates: ["obj-a", "obj-b"], min: 1, max: 2 }),
      makePendingChoice("ORDER_CARDS", { cards: ["obj-a", "obj-b"] }),
      makePendingChoice("ORDER_TRIGGERS", { triggers: ["trigger-a", "trigger-b"] }),
      makePendingChoice("NAME_CARD", {}),
      makePendingChoice("CHOOSE_REPLACEMENT", { replacements: ["replacement-a", "replacement-b"] }),
      makePendingChoice("CHOOSE_MODE", { modes: [{ id: "mode-a", label: "Mode A" }] }),
      makePendingChoice("CHOOSE_TARGET", {
        targetConstraints: {
          allowedKinds: ["object", "player"],
          objectIds: ["obj-a"],
          playerIds: ["p1", "p2"]
        }
      }),
      makePendingChoice("CHOOSE_YES_NO", { prompt: "Choose yes or no" })
    ];

    expect(pendingChoices).toHaveLength(8);
    expect(new Set(pendingChoices.map((choice) => choice.type))).toEqual(
      new Set([
        "CHOOSE_CARDS",
        "ORDER_CARDS",
        "ORDER_TRIGGERS",
        "NAME_CARD",
        "CHOOSE_REPLACEMENT",
        "CHOOSE_MODE",
        "CHOOSE_TARGET",
        "CHOOSE_YES_NO"
      ])
    );
  });

  it("discriminates ChoiceConstraints by choice type", () => {
    const chooseCards = makePendingChoice("CHOOSE_CARDS", {
      candidates: ["obj-a", "obj-b"],
      min: 0,
      max: 2
    });

    expect(countRange(chooseCards)).toBe(2);
  });

  it("stores forPlayer as the required responding player", () => {
    const choice = makePendingChoice("CHOOSE_YES_NO", { prompt: "Confirm?" });
    expect(choice.forPlayer).toBe("p1");
  });

  it("stores and exposes prompt text", () => {
    const choice = makePendingChoice("NAME_CARD", {});
    expect(choice.prompt).toBe("Resolve NAME_CARD");
  });

  it("enforces CHOOSE_CARDS min/max boundaries", () => {
    const choice = makePendingChoice("CHOOSE_CARDS", {
      candidates: ["obj-a", "obj-b", "obj-c"],
      min: 1,
      max: 2
    });

    expect(choice.constraints.min).toBe(1);
    expect(choice.constraints.max).toBe(2);
    expect(choice.constraints.min).toBeLessThanOrEqual(choice.constraints.max);
  });

  it("requires ORDER_CARDS constraints to include card ids", () => {
    const choice = makePendingChoice("ORDER_CARDS", { cards: ["obj-a", "obj-b"] });
    expect(choice.constraints.cards).toEqual(["obj-a", "obj-b"]);
  });
});
