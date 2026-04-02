import { describe, expect, it } from "vitest";

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
});
