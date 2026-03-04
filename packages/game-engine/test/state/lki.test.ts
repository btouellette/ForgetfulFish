import { describe, expect, it } from "vitest";

import type { GameObject, GameObjectView } from "../../src/state/gameObject";
import { captureSnapshot, lkiKey, lookupLKI, type LKISnapshot } from "../../src/state/lki";
import type { ZoneRef } from "../../src/state/zones";

function createObject(id: string, zcc: number): GameObject {
  return {
    id,
    zcc,
    cardDefId: "island",
    owner: "player-1",
    controller: "player-1",
    counters: new Map([["charge", 1]]),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "library", scope: "shared" }
  };
}

describe("state/lki", () => {
  it("captureSnapshot creates a snapshot from a game object", () => {
    const object = createObject("obj-1", 0);
    const derivedView: GameObjectView = { ...object };
    const zone: ZoneRef = { kind: "battlefield", scope: "shared" };

    const snapshot = captureSnapshot(object, derivedView, zone);

    expect(snapshot.ref).toEqual({ id: "obj-1", zcc: 0 });
    expect(snapshot.zone).toEqual(zone);
    expect(snapshot.base.zone).toEqual(zone);
    expect(snapshot.derived.zone).toEqual(zone);
    expect(snapshot.base.id).toBe("obj-1");
    expect(snapshot.derived.id).toBe("obj-1");
  });

  it("lookupLKI finds the correct snapshot by id and zcc", () => {
    const store = new Map<string, LKISnapshot>();
    const snapshot = captureSnapshot(createObject("obj-2", 3), createObject("obj-2", 3), {
      kind: "graveyard",
      scope: "shared"
    });

    store.set(lkiKey("obj-2", 3), snapshot);

    expect(lookupLKI(store, "obj-2", 3)).toEqual(snapshot);
  });

  it("lookupLKI returns undefined for wrong zcc", () => {
    const store = new Map<string, LKISnapshot>();
    store.set(
      lkiKey("obj-3", 2),
      captureSnapshot(createObject("obj-3", 2), createObject("obj-3", 2), {
        kind: "exile",
        scope: "shared"
      })
    );

    expect(lookupLKI(store, "obj-3", 1)).toBeUndefined();
  });

  it("lookupLKI returns undefined for non-existent id", () => {
    const store = new Map<string, LKISnapshot>();
    store.set(
      lkiKey("obj-4", 1),
      captureSnapshot(createObject("obj-4", 1), createObject("obj-4", 1), {
        kind: "stack",
        scope: "shared"
      })
    );

    expect(lookupLKI(store, "obj-missing", 1)).toBeUndefined();
  });

  it("snapshot stores identical base and derived views initially", () => {
    const object = createObject("obj-5", 4);
    const derivedView: GameObjectView = { ...object };
    const snapshot = captureSnapshot(object, derivedView, { kind: "library", scope: "shared" });

    expect(snapshot.base).toEqual(snapshot.derived);
  });

  it("lkiKey follows exact id:zcc format", () => {
    expect(lkiKey("obj-9", 42)).toBe("obj-9:42");
  });
});
