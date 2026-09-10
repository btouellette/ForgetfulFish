import { describe, expect, it } from "vitest";

import type { ResolveValue } from "../../../src/cards/resolveEffect";
import { evaluateResolveValue } from "../../../src/stack/effects/values";
import type { GameObject } from "../../../src/state/gameObject";
import { zoneKey, type ZoneRef } from "../../../src/state/zones";

const GRAVEYARD: ZoneRef = { kind: "graveyard", scope: "shared" };

function makeObject(id: string, cardDefId: string): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: GRAVEYARD
  };
}

function makeContext(scratch: Record<string, unknown> = {}) {
  const objects = [
    makeObject("obj-a", "accumulated-knowledge"),
    makeObject("obj-b", "brainstorm"),
    makeObject("obj-c", "accumulated-knowledge")
  ];

  return {
    scratch,
    zones: new Map<string, string[]>([[zoneKey(GRAVEYARD), objects.map((object) => object.id)]]),
    objectPool: new Map(objects.map((object) => [object.id, object])),
    resolveZone: () => GRAVEYARD,
    controller: "p1",
    sourceCardDefId: "accumulated-knowledge"
  };
}

function evaluate(value: ResolveValue, scratch: Record<string, unknown> = {}): number {
  return evaluateResolveValue(value, makeContext(scratch));
}

describe("stack/effects/values", () => {
  it("evaluates a literal", () => {
    expect(evaluate({ kind: "literal", value: 3 })).toBe(3);
  });

  it("counts every object in a zone", () => {
    expect(evaluate({ kind: "zone_size", zone: "graveyard", player: "controller" })).toBe(3);
  });

  it("counts only objects matching the source card definition", () => {
    expect(
      evaluate({
        kind: "count_in_zone",
        zone: "graveyard",
        player: "controller",
        filter: { kind: "same_card_definition_as_source" }
      })
    ).toBe(2);
  });

  it("counts objects matching a named card definition", () => {
    expect(
      evaluate({
        kind: "count_in_zone",
        zone: "graveyard",
        player: "controller",
        filter: { kind: "card_definition", cardDefId: "brainstorm" }
      })
    ).toBe(1);
  });

  it("reads a number from scratch and treats a missing key as zero", () => {
    expect(evaluate({ kind: "scratch_number", key: "count" }, { count: 4 })).toBe(4);
    expect(evaluate({ kind: "scratch_number", key: "count" })).toBe(0);
  });

  it("sums nested values", () => {
    expect(
      evaluate({
        kind: "sum",
        values: [
          { kind: "literal", value: 1 },
          {
            kind: "sum",
            values: [
              { kind: "literal", value: 2 },
              {
                kind: "count_in_zone",
                zone: "graveyard",
                player: "controller",
                filter: { kind: "same_card_definition_as_source" }
              }
            ]
          }
        ]
      })
    ).toBe(5);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(evaluate({ kind: "clamp", value: { kind: "literal", value: -4 }, min: 0 })).toBe(0);
    expect(evaluate({ kind: "clamp", value: { kind: "literal", value: 9 }, max: 3 })).toBe(3);
  });

  it("never yields a negative count from a sum of negative literals", () => {
    expect(
      evaluate({
        kind: "clamp",
        value: {
          kind: "sum",
          values: [
            { kind: "literal", value: 1 },
            { kind: "literal", value: -5 }
          ]
        },
        min: 0
      })
    ).toBe(0);
  });
});
