import { describe, expect, it } from "vitest";

import { ClientDriver } from "../helpers/clientDriver";

function runTwoTurnIslandScenario(driver: ClientDriver): {
  p1Blue: number;
  p2Blue: number;
  eventTypes: readonly string[];
} {
  driver.seedSharedLibrary(20);
  driver.seedPlayerHand("p2", "obj-p2-seed-hand");

  driver.advanceUntil(
    (state) =>
      state.turnState.activePlayerId === "p2" &&
      state.turnState.step === "MAIN_1" &&
      state.turnState.priorityState.playerWithPriority === "p2"
  );
  const p2LandId = driver.playFirstLegalLandFor("p2");
  driver.tapIslandForMana(p2LandId);

  driver.advanceUntil(
    (state) =>
      state.turnState.activePlayerId === "p1" &&
      state.turnState.step === "MAIN_1" &&
      state.turnState.priorityState.playerWithPriority === "p1"
  );
  const p1LandId = driver.playFirstLegalLandFor("p1");
  driver.tapIslandForMana(p1LandId);

  return {
    p1Blue: driver.state.players[0].manaPool.blue,
    p2Blue: driver.state.players[1].manaPool.blue,
    eventTypes: driver.eventTypes
  };
}

describe("integration/turn-cycle", () => {
  it("untap step untaps permanents controlled by the active player", () => {
    const driver = new ClientDriver("turn-untap", "seed-turn-untap");
    driver.seedBattlefieldIsland("obj-tapped-island", "p1", true);

    driver.passUntilStepChanges();

    expect(driver.state.turnState.step).toBe("UPKEEP");
    expect(driver.state.objectPool.get("obj-tapped-island")?.tapped).toBe(false);
  });

  it("draw step adds exactly one card to the active player's hand", () => {
    const driver = new ClientDriver("turn-draw", "seed-turn-draw");
    driver.seedSharedLibrary(20);

    driver.advanceUntil(
      (state) => state.turnState.activePlayerId === "p2" && state.turnState.step === "DRAW"
    );
    const handBefore = driver.state.players[1].hand.length;
    const events = driver.passUntilStepChanges();

    expect(driver.state.turnState.step).toBe("MAIN_1");
    expect(driver.state.players[1].hand.length).toBe(handBefore + 1);
    expect(events[0]).toBe("PRIORITY_PASSED");
    expect(events).toContain("PHASE_CHANGED");
    expect(events.indexOf("CARD_DRAWN")).toBeGreaterThan(events.indexOf("PRIORITY_PASSED"));
    expect(events).toContain("CARD_DRAWN");
  });

  it("play land moves the card from hand to battlefield", () => {
    const driver = new ClientDriver("turn-play-land", "seed-turn-play-land");
    driver.seedSharedLibrary(20);
    driver.advanceUntil(
      (state) =>
        state.turnState.activePlayerId === "p2" &&
        state.turnState.step === "MAIN_1" &&
        state.turnState.priorityState.playerWithPriority === "p2"
    );

    const handBefore = driver.state.players[1].hand.length;
    const cardId = driver.playFirstLegalLandFor("p2");
    const battlefield = driver.state.zones.get("shared:battlefield") ?? [];

    expect(driver.state.players[1].hand.length).toBe(handBefore - 1);
    expect(battlefield).toContain(cardId);
  });

  it("passing priority transfers priority and advances on double-pass", () => {
    const driver = new ClientDriver("turn-priority", "seed-turn-priority");
    driver.advanceUntil(
      (state) =>
        state.turnState.activePlayerId === "p1" &&
        state.turnState.step === "MAIN_1" &&
        state.turnState.priorityState.playerWithPriority === "p1"
    );

    const firstPass = driver.run({ type: "PASS_PRIORITY" });
    expect(firstPass.nextState.turnState.priorityState.playerWithPriority).toBe("p2");
    expect(firstPass.newEvents.map((event) => event.type)).toEqual(["PRIORITY_PASSED"]);

    const secondPass = driver.run({ type: "PASS_PRIORITY" });
    expect(secondPass.nextState.turnState.step).toBe("BEGIN_COMBAT");
    expect(secondPass.nextState.turnState.priorityState.playerWithPriority).toBe("p1");
    const secondPassTypes = secondPass.newEvents.map((event) => event.type);
    expect(secondPassTypes[0]).toBe("PRIORITY_PASSED");
    expect(secondPassTypes[1]).toBe("PHASE_CHANGED");
    expect(secondPass.newEvents[0]?.seq).toBeLessThan(secondPass.newEvents[1]?.seq ?? Infinity);
  });

  it("advances through the full phase/step sequence with pass-priority pairs", () => {
    const driver = new ClientDriver("turn-sequence", "seed-turn-sequence");

    const visited: string[] = [driver.state.turnState.step];
    for (let index = 0; index < 12; index += 1) {
      driver.passUntilStepChanges();
      visited.push(driver.state.turnState.step);
    }

    expect(visited).toEqual([
      "UNTAP",
      "UPKEEP",
      "DRAW",
      "MAIN_1",
      "BEGIN_COMBAT",
      "DECLARE_ATTACKERS",
      "DECLARE_BLOCKERS",
      "COMBAT_DAMAGE",
      "END_COMBAT",
      "MAIN_2",
      "END",
      "CLEANUP",
      "UNTAP"
    ]);
  });

  it("maintains invariants while stepping through repeated command traffic", () => {
    const driver = new ClientDriver("turn-invariants", "seed-turn-invariants");
    driver.seedSharedLibrary(20);

    for (let index = 0; index < 16; index += 1) {
      driver.passUntilStepChanges();
    }

    expect(driver.state.version).toBeGreaterThan(0);
  });

  it("is deterministic across repeated command-driven two-turn Island scenarios", () => {
    const driverA = new ClientDriver("turn-events-a", "seed-turn-events");
    const driverB = new ClientDriver("turn-events-b", "seed-turn-events");

    const resultA = runTwoTurnIslandScenario(driverA);
    const resultB = runTwoTurnIslandScenario(driverB);

    expect(resultA.p1Blue).toBe(1);
    expect(resultA.p2Blue).toBe(1);
    expect(
      resultA.eventTypes.filter((type) => type === "CARD_DRAWN").length
    ).toBeGreaterThanOrEqual(2);
    expect(
      resultA.eventTypes.filter((type) => type === "ZONE_CHANGE").length
    ).toBeGreaterThanOrEqual(2);
    expect(resultA.eventTypes).toContain("PRIORITY_PASSED");
    expect(resultA.eventTypes).toContain("PHASE_CHANGED");
    expect(resultA.eventTypes).toEqual(resultB.eventTypes);
    expect(driverA.events.map((event) => [event.type, event.seq])).toEqual(
      driverB.events.map((event) => [event.type, event.seq])
    );
  });
});
