import { describe, expect, it } from "vitest";

import type { ResolveEffectKind } from "../../../src/cards/resolveEffect";
import {
  RESOLVE_EFFECT_KINDS,
  resolveEffectHandlers,
  targetRequirementFor
} from "../../../src/stack/effects/handlers";

describe("stack/effects/handlers table", () => {
  it("has exactly one entry per resolve effect kind", () => {
    const tableKinds = Object.keys(resolveEffectHandlers).sort();

    expect(tableKinds).toEqual([...RESOLVE_EFFECT_KINDS].sort());
    expect(new Set(tableKinds).size).toBe(RESOLVE_EFFECT_KINDS.length);
  });

  it("declares each entry's kind consistently with its table key", () => {
    for (const kind of RESOLVE_EFFECT_KINDS) {
      expect(resolveEffectHandlers[kind].kind).toBe(kind);
    }
  });

  it("declares stack-object targeting only for counter_target_spell", () => {
    const stackTargeting = RESOLVE_EFFECT_KINDS.filter(
      (kind) => targetRequirementFor(kind) === "stack_object"
    );

    expect(stackTargeting).toEqual(["counter_target_spell"]);
  });

  it("declares battlefield-object targeting for every battlefield-targeting kind", () => {
    const battlefieldTargeting = RESOLVE_EFFECT_KINDS.filter(
      (kind) => targetRequirementFor(kind) === "battlefield_object"
    ).sort();

    expect(battlefieldTargeting).toEqual(
      [
        "add_continuous_effect_to_target",
        "add_text_change_effect_to_target",
        "set_control_of_target",
        "untap_target"
      ].sort()
    );
  });

  it("declares no targeting for pure card-flow kinds", () => {
    const untargeted: ResolveEffectKind[] = [
      "draw_cards",
      "choose_cards",
      "order_cards",
      "move_ordered_cards",
      "name_card",
      "choose_mode",
      "mill_cards",
      "shuffle_zone"
    ];

    for (const kind of untargeted) {
      expect(targetRequirementFor(kind)).toBe("none");
    }
  });

  it("no longer carries card-specific control-flow kinds", () => {
    expect(RESOLVE_EFFECT_KINDS).not.toContain("draw_by_named_hit");
    expect(RESOLVE_EFFECT_KINDS).not.toContain("draw_by_graveyard_self_count");
  });

  it("rejects a handler invoked with a spec of a different kind", () => {
    expect(() =>
      resolveEffectHandlers.draw_cards.execute(
        { kind: "untap_target", target: "first_object_target" },
        // the context is never reached — the kind guard throws first
        {} as never
      )
    ).toThrow(/expected resolve effect kind 'draw_cards'/);
  });
});
