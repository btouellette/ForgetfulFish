import { describe, expect, it } from "vitest";

import { OnResolveRegistry } from "../../src/stack/onResolveRegistry";

describe("stack/onResolveRegistry", () => {
  it("recognizes registered resolve effects", () => {
    const registry = new OnResolveRegistry([
      { kind: "draw_cards", count: 3, player: "controller" },
      {
        kind: "choose_cards",
        from: { kind: "zone", zone: "hand", player: "controller" },
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

    expect(registry.has("draw_cards")).toBe(false);
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

describe("stack/onResolveRegistry composite specs", () => {
  it("finds effects nested inside composite branches", () => {
    const registry = new OnResolveRegistry([
      {
        kind: "conditional",
        condition: { kind: "has_target", target: "player" },
        then: [{ kind: "mill_cards", count: 4, player: "target_player_or_controller" }],
        else: [
          {
            kind: "for_each_player",
            effects: [{ kind: "draw_cards", count: 1, player: "iterated_player" }]
          }
        ]
      }
    ]);

    expect(registry.has("conditional")).toBe(true);
    expect(registry.has("mill_cards")).toBe(true);
    expect(registry.has("for_each_player")).toBe(true);
    expect(registry.has("draw_cards")).toBe(true);
    expect(registry.has("shuffle_zone")).toBe(false);
  });

  it("treats a target used in only some modes as optional", () => {
    const registry = new OnResolveRegistry([
      {
        kind: "modal",
        prompt: "Choose one",
        modes: [
          {
            id: "mill",
            effects: [{ kind: "mill_cards", count: 4, player: "target_player_or_controller" }]
          },
          { id: "phase", effects: [{ kind: "phase_out_target", target: "first_object_target" }] }
        ]
      }
    ]);

    expect(registry.has("phase_out_target")).toBe(true);
    expect(registry.requiresObjectTargets()).toBe(false);
    expect(registry.requiresBattlefieldObjectTargets()).toBe(false);
  });

  it("requires a target used in every mode", () => {
    const registry = new OnResolveRegistry([
      {
        kind: "modal",
        prompt: "Choose one",
        modes: [
          { id: "untap", effects: [{ kind: "untap_target", target: "first_object_target" }] },
          { id: "phase", effects: [{ kind: "phase_out_target", target: "first_object_target" }] }
        ]
      }
    ]);

    expect(registry.requiresObjectTargets()).toBe(true);
    expect(registry.requiresBattlefieldObjectTargets()).toBe(true);
    expect(registry.requiresStackObjectTargets()).toBe(false);
  });
});
