import { describe, expect, it } from "vitest";

import type { AbilityAst } from "../../src/cards/abilityAst";
import type { GameObjectBase, GameObjectView } from "../../src/state/gameObject";

describe("state/gameObject", () => {
  it("constructs GameObjectBase with all required fields", () => {
    const object: GameObjectBase = {
      id: "obj-1",
      zcc: 0,
      cardDefId: "island",
      owner: "player-1",
      controller: "player-1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "library", scope: "shared" }
    };

    expect(object.id).toBe("obj-1");
  });

  it("exposes all fields with correct values", () => {
    const object: GameObjectBase = {
      id: "obj-2",
      zcc: 4,
      cardDefId: "dandan",
      owner: "player-1",
      controller: "player-2",
      counters: new Map([["+1/+1", 2]]),
      damage: 1,
      tapped: true,
      summoningSick: true,
      attachments: ["obj-3"],
      abilities: [{ kind: "keyword", keyword: "flying" }],
      zone: { kind: "battlefield", scope: "shared" }
    };

    expect(object.zcc).toBe(4);
    expect(object.counters.get("+1/+1")).toBe(2);
    expect(object.attachments).toEqual(["obj-3"]);
    expect(object.zone).toEqual({ kind: "battlefield", scope: "shared" });
  });

  it("supports empty counters and attachments defaults", () => {
    const object: GameObjectBase = {
      id: "obj-4",
      zcc: 0,
      cardDefId: "island",
      owner: "player-1",
      controller: "player-1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "hand", scope: "player", playerId: "player-1" }
    };

    expect(object.counters.size).toBe(0);
    expect(object.attachments).toHaveLength(0);
  });

  it("GameObjectView is assignable from GameObjectBase", () => {
    const base: GameObjectBase = {
      id: "obj-5",
      zcc: 0,
      cardDefId: "island",
      owner: "player-1",
      controller: "player-1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "library", scope: "shared" }
    };

    const view: GameObjectView = base;
    expect(view.id).toBe("obj-5");
  });

  it("abilities can be empty or populated", () => {
    const populated: AbilityAst[] = [
      { kind: "keyword", keyword: "flying" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      }
    ];
    const empty: AbilityAst[] = [];

    expect(populated).toHaveLength(2);
    expect(empty).toHaveLength(0);
  });

  it("preserves object reference identity for same instance", () => {
    const object: GameObjectBase = {
      id: "obj-6",
      zcc: 0,
      cardDefId: "island",
      owner: "player-1",
      controller: "player-1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [],
      zone: { kind: "library", scope: "shared" }
    };

    const sameRef = object;
    expect(sameRef).toBe(object);
  });
});
