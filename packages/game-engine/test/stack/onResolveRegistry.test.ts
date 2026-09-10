import { describe, expect, it } from "vitest";

import type { ResolveEffectSpec } from "../../src/cards/resolveEffect";
import { LAYERS } from "../../src/effects/continuous/layers";
import { OnResolveRegistry } from "../../src/stack/onResolveRegistry";

describe("stack/onResolveRegistry", () => {
  it("recognizes registered resolve effects", () => {
    const registry = new OnResolveRegistry([
      { kind: "draw_cards", count: 3, player: "controller" },
      {
        kind: "choose_cards",
        zone: "hand",
        player: "controller",
        min: 2,
        max: 2,
        prompt: "Choose 2 cards",
        storeKey: "registry:selected"
      }
    ]);

    expect(registry.has("draw_cards")).toBe(true);
    expect(registry.has("choose_cards")).toBe(true);
    expect(registry.requiresObjectTargets()).toBe(false);
  });

  it("returns false for effects not present in the spec", () => {
    const registry = new OnResolveRegistry([
      {
        kind: "shuffle_zone",
        zone: "library",
        player: "controller",
        topCardFromKey: "registry:selected"
      }
    ]);

    expect(registry.has("draw_by_graveyard_self_count")).toBe(false);
    expect(registry.requiresObjectTargets()).toBe(false);
  });

  it("tracks target requirements from primitive resolve specs", () => {
    const registry = new OnResolveRegistry([
      { kind: "counter_target_spell", destination: "graveyard" },
      { kind: "counter_target_spell", destination: "library-top" }
    ]);

    expect(registry.requiresObjectTargets()).toBe(true);
    expect(registry.has("draw_cards")).toBe(false);
  });

  it("separates stack-object targeting from battlefield-object targeting", () => {
    const counterRegistry = new OnResolveRegistry([
      { kind: "counter_target_spell", destination: "graveyard" }
    ]);
    const untapRegistry = new OnResolveRegistry([
      { kind: "untap_target", target: "first_object_target" }
    ]);

    expect(counterRegistry.requiresStackObjectTargets()).toBe(true);
    expect(counterRegistry.requiresBattlefieldObjectTargets()).toBe(false);
    expect(untapRegistry.requiresStackObjectTargets()).toBe(false);
    expect(untapRegistry.requiresBattlefieldObjectTargets()).toBe(true);
  });

  it("requires battlefield-object targets for every battlefield-targeting spec", () => {
    const specs: ResolveEffectSpec[] = [
      { kind: "set_control_of_target", target: "first_object_target", duration: "end_of_turn" },
      { kind: "untap_target", target: "first_object_target" },
      {
        kind: "add_continuous_effect_to_target",
        target: "first_object_target",
        layer: LAYERS.ABILITY,
        duration: "end_of_turn",
        effect: { kind: "grant_keyword", payload: { keyword: "flying" } }
      },
      {
        kind: "add_text_change_effect_to_target",
        target: "first_object_target",
        duration: "permanent",
        fromKey: "registry:from",
        toKey: "registry:to"
      }
    ];

    for (const spec of specs) {
      const registry = new OnResolveRegistry([spec]);
      expect(registry.requiresBattlefieldObjectTargets()).toBe(true);
      expect(registry.requiresObjectTargets()).toBe(true);
    }
  });

  it("requires no targets for a card built only from untargeted specs", () => {
    const registry = new OnResolveRegistry([
      { kind: "draw_cards", count: 1, player: "controller" },
      { kind: "mill_cards", count: 3, player: "controller", storeKey: "registry:milled" }
    ]);

    expect(registry.requiresObjectTargets()).toBe(false);
    expect(registry.requiresStackObjectTargets()).toBe(false);
    expect(registry.requiresBattlefieldObjectTargets()).toBe(false);
  });
});
