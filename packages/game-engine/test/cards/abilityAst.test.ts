import { describe, expect, it } from "vitest";

import type {
  BasicLandType,
  Color,
  ColorAtom,
  ConditionAst,
  Duration,
  KeywordAbilityAst,
  StaticAbilityAst,
  TextChangeEffect
} from "../../src/cards/abilityAst";

describe("cards/abilityAst", () => {
  it("constructs a KeywordAbilityAst for islandwalk", () => {
    const ability: KeywordAbilityAst = { kind: "keyword", keyword: "landwalk", landType: "Island" };

    expect(ability.keyword).toBe("landwalk");
    expect(ability.landType).toBe("Island");
  });

  it("constructs a KeywordAbilityAst for haste", () => {
    const ability: KeywordAbilityAst = { kind: "keyword", keyword: "haste" };

    expect(ability.keyword).toBe("haste");
  });

  it("constructs a StaticAbilityAst for attack restriction", () => {
    const staticAbility: StaticAbilityAst = {
      kind: "static",
      staticKind: "cant_attack_unless",
      condition: { kind: "defender_controls_land_type", landType: "Island" }
    };

    expect(staticAbility.staticKind).toBe("cant_attack_unless");
  });

  it("constructs a StaticAbilityAst for land-type sacrifice checks", () => {
    const staticAbility: StaticAbilityAst = {
      kind: "static",
      staticKind: "when_no_islands_sacrifice",
      landType: "Island"
    };

    expect(staticAbility.landType).toBe("Island");
  });

  it("supports all Duration variants", () => {
    const durations: Duration[] = [
      "permanent",
      "until_end_of_turn",
      "while_source_on_battlefield",
      "until_cleanup",
      { kind: "as_long_as", condition: { kind: "defender_controls_land_type", landType: "Island" } }
    ];

    expect(durations).toHaveLength(5);
  });

  it("discriminates Color and BasicLandType atoms", () => {
    const color: Color = "blue";
    const landType: BasicLandType = "Island";
    const colorAtom: ColorAtom = { kind: "color", value: color };

    expect(colorAtom.value).toBe("blue");
    expect(landType).toBe("Island");
  });

  it("supports TextChangeEffect targeting an ObjectRef", () => {
    const effect: TextChangeEffect = {
      kind: "text_change",
      fromLandType: "Island",
      toLandType: "Swamp",
      target: { id: "obj-1", zcc: 1 },
      duration: "until_end_of_turn"
    };

    expect(effect.target.id).toBe("obj-1");
    expect(effect.toLandType).toBe("Swamp");
  });

  it("represents condition ast for defender controls Island", () => {
    const condition: ConditionAst = {
      kind: "defender_controls_land_type",
      landType: "Island"
    };

    expect(condition.landType).toBe("Island");
  });
});
