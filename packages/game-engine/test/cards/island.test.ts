import { describe, expect, it } from "vitest";

import { cardRegistry, islandCardDefinition } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";

describe("cards/island", () => {
  it('loads Island definition by the string ID "island"', () => {
    expect(cardRegistry.get("island")).toEqual(islandCardDefinition);
  });

  it("matches Island type line and subtype definition", () => {
    const island = cardRegistry.get("island");

    expect(island?.typeLine).toEqual(["Land"]);
    expect(island?.subtypes).toEqual([{ kind: "basic_land_type", value: "Island" }]);
  });

  it("defines mana ability AST with tap cost and add blue mana effect", () => {
    const island = cardRegistry.get("island");
    const ability = island?.activatedAbilities[0];

    expect(ability?.kind).toBe("activated");
    if (!ability || ability.kind !== "activated") {
      throw new Error("expected an activated ability");
    }

    expect(ability.cost).toEqual([{ kind: "tap" }]);
    expect(ability.effect).toEqual({ kind: "add_mana", mana: { blue: 1 } });
  });

  it("returns undefined for non-existent card IDs", () => {
    expect(cardRegistry.get("not-a-card")).toBeUndefined();
  });

  it("satisfies CardDefinition interface", () => {
    const island: CardDefinition | undefined = cardRegistry.get("island");
    expect(island?.id).toBe("island");
  });

  it("marks Island activated ability as a mana ability", () => {
    const island = cardRegistry.get("island");
    const ability = island?.activatedAbilities[0];

    if (!ability || ability.kind !== "activated") {
      throw new Error("expected an activated ability");
    }

    expect(ability.isManaAbility).toBe(true);
  });

  it("has no mana cost for Island", () => {
    const island = cardRegistry.get("island");
    expect(island?.manaCost).toEqual({});
  });
});
