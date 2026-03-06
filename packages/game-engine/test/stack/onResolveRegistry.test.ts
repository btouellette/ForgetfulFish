import { describe, expect, it } from "vitest";

import { OnResolveRegistry } from "../../src/stack/onResolveRegistry";

describe("stack/onResolveRegistry", () => {
  it("recognizes registered resolve effects", () => {
    const registry = new OnResolveRegistry([
      { id: "DRAW_CHOOSE_RETURN", drawAmount: 3, returnAmount: 2 },
      { id: "NAME_MILL_DRAW_ON_HIT", millAmount: 2, drawOnHitAmount: 2 }
    ]);

    expect(registry.has("DRAW_CHOOSE_RETURN")).toBe(true);
    expect(registry.has("NAME_MILL_DRAW_ON_HIT")).toBe(true);
  });

  it("returns false for effects not present in the spec", () => {
    const registry = new OnResolveRegistry([
      { id: "SEARCH_LIBRARY_SHUFFLE_TOP", typeFilter: ["Instant", "Sorcery"], min: 0, max: 1 }
    ]);

    expect(registry.has("DRAW_BY_GRAVEYARD_COPY_COUNT")).toBe(false);
    expect(registry.has("COUNTER_SPELL")).toBe(false);
  });

  it("handles duplicate effect specs without changing membership semantics", () => {
    const registry = new OnResolveRegistry([
      { id: "COUNTER_SPELL", destination: "graveyard" },
      { id: "COUNTER_SPELL", destination: "library-top" }
    ]);

    expect(registry.has("COUNTER_SPELL")).toBe(true);
    expect(registry.has("DRAW_CHOOSE_RETURN")).toBe(false);
  });
});
