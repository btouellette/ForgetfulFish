import { describe, expect, it } from "vitest";

import type { GameObject } from "../../src/state/gameObject";
import type { ObjectId, ObjectRef, PlayerId } from "../../src/state/objectRef";
import { bumpZcc, zoneKey, type ZoneRef } from "../../src/state/zones";

describe("state/objectRef", () => {
  it("ObjectId is usable as a string alias", () => {
    const objectId: ObjectId = "obj-1";
    expect(objectId).toBe("obj-1");
  });

  it("ObjectRef equality compares id and zcc", () => {
    const first: ObjectRef = { id: "obj-1", zcc: 2 };
    const second: ObjectRef = { id: "obj-1", zcc: 2 };

    expect(first).toEqual(second);
  });

  it("ObjectRef inequality detects id or zcc differences", () => {
    const base: ObjectRef = { id: "obj-1", zcc: 2 };

    expect(base).not.toEqual({ id: "obj-2", zcc: 2 });
    expect(base).not.toEqual({ id: "obj-1", zcc: 3 });
  });

  it("bumpZcc returns a new object with incremented zcc", () => {
    const obj: GameObject = {
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

    const bumped = bumpZcc(obj);

    expect(bumped).not.toBe(obj);
    expect(bumped.zcc).toBe(1);
    expect(obj.zcc).toBe(0);
  });

  it("ZoneRef supports shared and player-scoped variants", () => {
    const playerId: PlayerId = "player-1";
    const zones: ZoneRef[] = [
      { kind: "graveyard", scope: "shared" },
      { kind: "graveyard", scope: "player", playerId },
      { kind: "hand", scope: "player", playerId }
    ];

    expect(zones).toHaveLength(3);
  });

  it("ZoneKey serialization is deterministic and unique", () => {
    const playerId: PlayerId = "player-2";
    const sharedGraveyard: ZoneRef = { kind: "graveyard", scope: "shared" };
    const playerGraveyard: ZoneRef = { kind: "graveyard", scope: "player", playerId };

    expect(zoneKey(sharedGraveyard)).toBe("shared:graveyard");
    expect(zoneKey(playerGraveyard)).toBe("player:player-2:graveyard");
    expect(zoneKey(sharedGraveyard)).not.toBe(zoneKey(playerGraveyard));
  });
});
