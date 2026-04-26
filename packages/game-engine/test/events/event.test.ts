import { describe, expect, it } from "vitest";

import { createEvent, type EventEnvelope, type GameEventPayload } from "../../src/events/event";

function samplePayloads(): GameEventPayload[] {
  return [
    { type: "CARD_DRAWN", playerId: "p1", cardId: "obj-1" },
    {
      type: "DECLARE_ATTACKERS",
      controller: "p1",
      attackers: [{ id: "obj-attack-1", zcc: 0 }]
    },
    {
      type: "ZONE_CHANGE",
      objectId: "obj-1",
      oldZcc: 0,
      newZcc: 1,
      from: { kind: "library", scope: "shared" },
      to: { kind: "hand", scope: "player", playerId: "p1" },
      toIndex: 0
    },
    { type: "SPELL_CAST", object: { id: "obj-2", zcc: 1 }, controller: "p1" },
    {
      type: "ABILITY_TRIGGERED",
      source: { id: "obj-3", zcc: 0 },
      controller: "p1"
    },
    {
      type: "ABILITY_ACTIVATED",
      source: { id: "obj-3", zcc: 0 },
      controller: "p1"
    },
    { type: "SPELL_RESOLVED", object: { id: "obj-2", zcc: 1 } },
    { type: "SPELL_COUNTERED", object: { id: "obj-2", zcc: 1 } },
    {
      type: "DAMAGE_DEALT",
      amount: 3,
      source: { id: "obj-5", zcc: 0 },
      target: { id: "obj-6", zcc: 0 }
    },
    { type: "LIFE_CHANGED", playerId: "p2", amount: -3, newTotal: 17 },
    { type: "PRIORITY_PASSED", playerId: "p1" },
    { type: "PHASE_CHANGED", phase: "BEGIN_COMBAT", step: "BEGIN_COMBAT" },
    { type: "PLAYER_LOST", playerId: "p2", reason: "life_zero" },
    { type: "SHUFFLED", zone: { kind: "library", scope: "shared" }, resultOrder: ["obj-1"] },
    { type: "CHOICE_MADE", playerId: "p1", choiceId: "choice-1", selection: { pick: 1 } },
    { type: "RNG_CONSUMED", purpose: "shuffle", result: 0.42 },
    { type: "CONTINUOUS_EFFECT_ADDED", effectId: "ce-1", source: { id: "obj-7", zcc: 0 } },
    { type: "CONTINUOUS_EFFECT_REMOVED", effectId: "ce-1" },
    { type: "CONTROL_CHANGED", object: { id: "obj-6", zcc: 1 }, from: "p1", to: "p2" }
  ];
}

function assertExhaustive(payload: GameEventPayload): string {
  switch (payload.type) {
    case "CARD_DRAWN":
    case "DECLARE_ATTACKERS":
    case "ZONE_CHANGE":
    case "SPELL_CAST":
    case "ABILITY_TRIGGERED":
    case "ABILITY_ACTIVATED":
    case "SPELL_RESOLVED":
    case "SPELL_COUNTERED":
    case "DAMAGE_DEALT":
    case "LIFE_CHANGED":
    case "PRIORITY_PASSED":
    case "PHASE_CHANGED":
    case "PLAYER_LOST":
    case "SHUFFLED":
    case "CHOICE_MADE":
    case "RNG_CONSUMED":
    case "CONTINUOUS_EFFECT_ADDED":
    case "CONTINUOUS_EFFECT_REMOVED":
    case "CONTROL_CHANGED":
      return payload.type;
    default: {
      const neverPayload: never = payload;
      return neverPayload;
    }
  }
}

describe("events/event", () => {
  it("constructs all 19 GameEventPayload variants", () => {
    const payloads = samplePayloads();

    expect(payloads).toHaveLength(19);
  });

  it("narrows discriminated union fields correctly", () => {
    const payload = samplePayloads().find((item) => item.type === "DAMAGE_DEALT");

    if (!payload || payload.type !== "DAMAGE_DEALT") {
      throw new Error("expected DAMAGE_DEALT payload");
    }

    expect(payload.amount).toBe(3);
    expect(payload.target.id).toBe("obj-6");
  });

  it("createEvent uses stable gameId:seq identifier", () => {
    const envelope: EventEnvelope = {
      engineVersion: "0.1.0",
      schemaVersion: 1,
      gameId: "game-123"
    };
    const payload: GameEventPayload = { type: "PRIORITY_PASSED", playerId: "p1" };

    const event = createEvent(envelope, 7, payload);

    expect(event.id).toBe("game-123:7");
    expect(event.seq).toBe(7);
  });

  it("event includes envelope fields without mutating source envelope", () => {
    const envelope: EventEnvelope = Object.freeze({
      engineVersion: "0.1.0",
      schemaVersion: 2,
      gameId: "game-222"
    });

    const event = createEvent(envelope, 1, {
      type: "CHOICE_MADE",
      playerId: "p1",
      choiceId: "c1",
      selection: { chosen: ["obj-1"] }
    });

    expect(event.engineVersion).toBe("0.1.0");
    expect(event.schemaVersion).toBe(2);
    expect(event.gameId).toBe("game-222");
    expect(envelope).toEqual({ engineVersion: "0.1.0", schemaVersion: 2, gameId: "game-222" });
  });

  it("switch exhaustiveness is enforced via never", () => {
    const types = samplePayloads().map((payload) => assertExhaustive(payload));
    expect(types).toContain("CONTROL_CHANGED");
  });

  it("sequence numbers can be assigned monotonically", () => {
    const envelope: EventEnvelope = {
      engineVersion: "0.1.0",
      schemaVersion: 1,
      gameId: "game-999"
    };

    const first = createEvent(envelope, 1, { type: "PRIORITY_PASSED", playerId: "p1" });
    const second = createEvent(envelope, 2, { type: "PRIORITY_PASSED", playerId: "p2" });

    expect(first.seq).toBeLessThan(second.seq);
  });
});
