import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { Command } from "../../src/commands/command";
import { assertStateInvariants } from "./invariants";
import {
  commandArbitrary,
  commandSequenceArbitrary,
  gameObjectArbitrary,
  gameStateArbitrary,
  zoneRefArbitrary
} from "./generators";

function assertCommandShape(command: Command): void {
  switch (command.type) {
    case "CAST_SPELL": {
      expect(command.cardId).toBeTypeOf("string");
      break;
    }
    case "ACTIVATE_ABILITY": {
      expect(command.sourceId).toBeTypeOf("string");
      expect(Number.isInteger(command.abilityIndex)).toBe(true);
      break;
    }
    case "PASS_PRIORITY": {
      break;
    }
    case "MAKE_CHOICE": {
      expect(command.payload).toBeDefined();
      break;
    }
    case "DECLARE_ATTACKERS": {
      expect(Array.isArray(command.attackers)).toBe(true);
      break;
    }
    case "DECLARE_BLOCKERS": {
      expect(Array.isArray(command.assignments)).toBe(true);
      break;
    }
    case "PLAY_LAND": {
      expect(command.cardId).toBeTypeOf("string");
      break;
    }
    case "CONCEDE": {
      break;
    }
    default: {
      const _never: never = command;
      throw new Error(`unhandled command variant: ${JSON.stringify(_never)}`);
    }
  }
}

describe("helpers/generators", () => {
  it("generates GameState values that pass state invariants", () => {
    fc.assert(
      fc.property(gameStateArbitrary, (state) => {
        expect(() => assertStateInvariants(state)).not.toThrow();
      }),
      { numRuns: 200 }
    );
  });

  it("generates well-formed Command variants", () => {
    fc.assert(
      fc.property(commandArbitrary, (command) => {
        assertCommandShape(command);
      }),
      { numRuns: 300 }
    );
  });

  it("supports shrinking to minimal counterexamples", () => {
    const result = fc.check(
      fc.property(commandSequenceArbitrary, () => false),
      {
        endOnFailure: true,
        numRuns: 50,
        seed: 1729
      }
    );

    expect(result.failed).toBe(true);
    if (!result.failed || result.counterexample === null) {
      throw new Error("expected fast-check to provide a counterexample");
    }

    const sequence = result.counterexample[0];
    expect(Array.isArray(sequence)).toBe(true);
    expect(sequence).toHaveLength(0);
  });

  it("has balanced zone, card type, and player-state coverage", () => {
    const zoneSamples = fc.sample(zoneRefArbitrary, { numRuns: 200, seed: 7 });
    const objectSamples = fc.sample(gameObjectArbitrary, { numRuns: 200, seed: 11 });
    const stateSamples = fc.sample(gameStateArbitrary, { numRuns: 200, seed: 13 });

    const zoneScopes = new Set(zoneSamples.map((zone) => zone.scope));
    const zoneKinds = new Set(zoneSamples.map((zone) => zone.kind));
    const cardDefIds = new Set(objectSamples.map((object) => object.cardDefId));
    const lifeTotals = new Set(
      stateSamples.flatMap((state) => state.players.map((player) => player.life))
    );

    expect(zoneScopes.size).toBeGreaterThanOrEqual(2);
    expect(zoneKinds.size).toBeGreaterThanOrEqual(4);
    expect(cardDefIds.size).toBeGreaterThanOrEqual(2);
    expect(lifeTotals.size).toBeGreaterThanOrEqual(3);
  });

  it("generates command sequences with schema-valid commands", () => {
    fc.assert(
      fc.property(commandSequenceArbitrary, (commands) => {
        for (const command of commands) {
          assertCommandShape(command);
        }
      }),
      { numRuns: 150 }
    );
  });
});
