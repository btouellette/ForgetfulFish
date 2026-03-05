import { describe, expect, it } from "vitest";

import { payManaCost, tapForMana } from "../../src/engine/kernel";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";

function createPermanent(
  id: string,
  cardDefId: string,
  controller: "p1" | "p2",
  tapped = false
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner: controller,
    controller,
    counters: new Map(),
    damage: 0,
    tapped,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone: { kind: "battlefield", scope: "shared" }
  };
}

function putOnBattlefield(
  state: ReturnType<typeof createInitialGameState>,
  object: GameObject
): void {
  state.objectPool.set(object.id, object);
  state.zones.get(zoneKey({ kind: "battlefield", scope: "shared" }))?.push(object.id);
}

describe("engine/mana", () => {
  it("tapForMana taps Island and adds one blue mana", () => {
    const state = createInitialGameState("p1", "p2", { id: "mana-1", rngSeed: "seed-mana-1" });
    putOnBattlefield(state, createPermanent("obj-island", "island", "p1"));

    const result = tapForMana(state, "obj-island");

    expect(result.state.objectPool.get("obj-island")?.tapped).toBe(true);
    expect(result.state.players[0].manaPool.blue).toBe(1);
  });

  it("payManaCost deducts one blue mana", () => {
    const base = createInitialGameState("p1", "p2", { id: "mana-2", rngSeed: "seed-mana-2" });
    const state = {
      ...base,
      players: [
        { ...base.players[0], manaPool: { ...base.players[0].manaPool, blue: 1 } },
        base.players[1]
      ] as typeof base.players
    };

    const result = payManaCost(state, "p1", { blue: 1 });

    expect(result).not.toBe("insufficient");
    expect(result !== "insufficient" && result.players[0].manaPool.blue).toBe(0);
  });

  it("payManaCost returns insufficient for empty pool", () => {
    const state = createInitialGameState("p1", "p2", { id: "mana-3", rngSeed: "seed-mana-3" });

    const result = payManaCost(state, "p1", { blue: 1 });

    expect(result).toBe("insufficient");
  });

  it("tapForMana rejects already-tapped land", () => {
    const state = createInitialGameState("p1", "p2", { id: "mana-4", rngSeed: "seed-mana-4" });
    putOnBattlefield(state, createPermanent("obj-island", "island", "p1", true));

    expect(() => tapForMana(state, "obj-island")).toThrow("permanent is already tapped");
  });

  it("payManaCost updates mana pool according to paid colors", () => {
    const base = createInitialGameState("p1", "p2", { id: "mana-5", rngSeed: "seed-mana-5" });
    const state = {
      ...base,
      players: [
        {
          ...base.players[0],
          manaPool: { ...base.players[0].manaPool, blue: 2, colorless: 1 }
        },
        base.players[1]
      ] as typeof base.players
    };

    const result = payManaCost(state, "p1", { blue: 1, colorless: 1 });

    expect(result).not.toBe("insufficient");
    if (result !== "insufficient") {
      expect(result.players[0].manaPool.blue).toBe(1);
      expect(result.players[0].manaPool.colorless).toBe(0);
    }
  });

  it("tapForMana rejects non-land permanents", () => {
    const state = createInitialGameState("p1", "p2", { id: "mana-6", rngSeed: "seed-mana-6" });
    putOnBattlefield(state, createPermanent("obj-creature", "not-a-land", "p1"));

    expect(() => tapForMana(state, "obj-creature")).toThrow("only lands can be tapped for mana");
  });

  it("tapForMana rejects lands that are not on battlefield", () => {
    const state = createInitialGameState("p1", "p2", { id: "mana-7", rngSeed: "seed-mana-7" });
    const inHand: GameObject = {
      ...createPermanent("obj-hand-land", "island", "p1"),
      zone: { kind: "hand", scope: "player", playerId: "p1" }
    };
    state.objectPool.set(inHand.id, inHand);

    expect(() => tapForMana(state, inHand.id)).toThrow(
      "only permanents on the battlefield can be tapped for mana"
    );
  });
});
