import { describe, expect, it } from "vitest";
import type { GameplayPendingChoice } from "@forgetful-fish/realtime-contract";

import {
  parseChooseCardsConstraints,
  parseNameCardConstraints,
  parseOrderCardsConstraints,
  parsePendingChoice
} from "./pending-choice";

function createPendingChoice(
  overrides: Partial<GameplayPendingChoice> = {}
): GameplayPendingChoice {
  return {
    id: "choice-1",
    type: "CHOOSE_CARDS",
    forPlayer: "player-1",
    prompt: "Choose cards",
    constraints: {
      candidates: ["obj-1", "obj-2"],
      min: 1,
      max: 2
    },
    ...overrides
  };
}

describe("pending-choice adapter", () => {
  it("parses valid CHOOSE_CARDS constraints", () => {
    const parsed = parseChooseCardsConstraints({
      candidates: ["obj-1", "obj-2"],
      min: 0,
      max: 1
    });

    expect(parsed).toEqual({
      ok: true,
      value: { candidates: ["obj-1", "obj-2"], min: 0, max: 1 }
    });
  });

  it("rejects malformed CHOOSE_CARDS constraints", () => {
    const parsed = parseChooseCardsConstraints({ candidates: "obj-1", min: 0, max: 1 });

    expect(parsed.ok).toBe(false);
  });

  it("parses valid ORDER_CARDS constraints", () => {
    const parsed = parseOrderCardsConstraints({ cards: ["obj-1", "obj-2"] });

    expect(parsed).toEqual({ ok: true, value: { cards: ["obj-1", "obj-2"] } });
  });

  it("accepts empty constraints for NAME_CARD", () => {
    const parsed = parseNameCardConstraints({});

    expect(parsed).toEqual({ ok: true, value: {} });
  });

  it("returns invalid marker when constraints do not match pending-choice type", () => {
    const parsed = parsePendingChoice(
      createPendingChoice({
        type: "ORDER_CARDS",
        constraints: { min: 1, max: 2 }
      })
    );

    expect(parsed.kind).toBe("invalid");
  });
});
