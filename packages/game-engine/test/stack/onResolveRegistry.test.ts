import { describe, expect, it } from "vitest";

import { OnResolveRegistry } from "../../src/stack/onResolveRegistry";

describe("stack/onResolveRegistry", () => {
  it("recognizes registered resolve effects", () => {
    const registry = new OnResolveRegistry([{ id: "BRAINSTORM" }, { id: "PREDICT" }]);

    expect(registry.has("BRAINSTORM")).toBe(true);
    expect(registry.has("PREDICT")).toBe(true);
  });

  it("returns false for effects not present in the spec", () => {
    const registry = new OnResolveRegistry([{ id: "MYSTICAL_TUTOR" }]);

    expect(registry.has("DRAW_ACCUMULATED_KNOWLEDGE")).toBe(false);
    expect(registry.has("COUNTER")).toBe(false);
  });

  it("handles duplicate effect specs without changing membership semantics", () => {
    const registry = new OnResolveRegistry([
      { id: "COUNTER" },
      { id: "COUNTER" },
      { id: "MOVE_ZONE" }
    ]);

    expect(registry.has("COUNTER")).toBe(true);
    expect(registry.has("MOVE_ZONE")).toBe(true);
    expect(registry.has("BRAINSTORM")).toBe(false);
  });
});
