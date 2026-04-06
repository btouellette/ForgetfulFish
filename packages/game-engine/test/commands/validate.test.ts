import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { partitionResolvedTargets, validateActivateAbility } from "../../src/commands/validate";
import type { Target } from "../../src/commands/command";
import { Rng } from "../../src/rng/rng";
import { resolveTopOfStack } from "../../src/stack/resolve";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const mentalNoteDefinition: CardDefinition = {
  id: "mental-note-p2-6",
  name: "Mental Note",
  manaCost: { blue: 1 },
  typeLine: ["Instant"],
  subtypes: [],
  color: ["blue"],
  supertypes: [],
  power: null,
  toughness: null,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

function makeObject(id: string, zcc: number, zone: GameObject["zone"]): GameObject {
  return {
    id,
    zcc,
    cardDefId: "island",
    owner: "p1",
    controller: "p1",
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone
  };
}

function setupStateWithStack(targets: Target[]): GameState {
  cardRegistry.set(mentalNoteDefinition.id, mentalNoteDefinition);

  const state = createInitialGameState("p1", "p2", { id: "validate-p2-6", rngSeed: "seed" });
  const stackZone = state.mode.resolveZone(state, "stack", "p1");
  const stackKey = zoneKey(stackZone);

  const stackSpell: GameObject = {
    ...makeObject("spell-on-stack", 0, stackZone),
    cardDefId: mentalNoteDefinition.id
  };

  state.objectPool.set(stackSpell.id, stackSpell);
  state.zones.set(stackKey, [stackSpell.id]);
  state.stack = [
    {
      id: "stack-item-1",
      object: { id: stackSpell.id, zcc: stackSpell.zcc },
      controller: "p1",
      targets,
      effectContext: {
        stackItemId: "stack-item-1",
        source: { id: stackSpell.id, zcc: stackSpell.zcc },
        controller: "p1",
        targets,
        cursor: { kind: "start" },
        whiteboard: { actions: [], scratch: {} }
      }
    }
  ];

  return state;
}

function addBattlefieldObject(state: GameState, id: string, zcc: number): void {
  const battlefieldZone = state.mode.resolveZone(state, "battlefield", "p1");
  const battlefieldKey = zoneKey(battlefieldZone);
  state.objectPool.set(id, makeObject(id, zcc, battlefieldZone));
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), id]);
}

describe("commands/validate target staleness", () => {
  it("treats matching object ref zcc as legal", () => {
    const state = setupStateWithStack([]);
    addBattlefieldObject(state, "target-1", 0);

    const validation = partitionResolvedTargets(state, [
      { kind: "object", object: { id: "target-1", zcc: 0 } }
    ]);

    expect(validation.legalTargets).toHaveLength(1);
    expect(validation.illegalTargets).toHaveLength(0);
  });

  it("treats changed-zone zcc mismatch as illegal target", () => {
    const state = setupStateWithStack([]);
    addBattlefieldObject(state, "target-1", 1);

    const validation = partitionResolvedTargets(state, [
      { kind: "object", object: { id: "target-1", zcc: 0 } }
    ]);

    expect(validation.legalTargets).toHaveLength(0);
    expect(validation.illegalTargets).toHaveLength(1);
  });

  it("fizzles a spell when all targets are illegal", () => {
    const state = setupStateWithStack([{ kind: "object", object: { id: "target-1", zcc: 0 } }]);
    addBattlefieldObject(state, "target-1", 2);

    const result = resolveTopOfStack(state, new Rng(state.rngSeed));
    const graveyard = state.mode.resolveZone(state, "graveyard", "p1");
    const graveyardCards = result.state.zones.get(zoneKey(graveyard)) ?? [];

    expect(graveyardCards).toContain("spell-on-stack");
    expect(result.events[0]?.type).toBe("SPELL_COUNTERED");
  });

  it("resolves with remaining legal targets when only some targets are illegal", () => {
    const state = setupStateWithStack([
      { kind: "object", object: { id: "target-legal", zcc: 0 } },
      { kind: "object", object: { id: "target-illegal", zcc: 0 } }
    ]);
    addBattlefieldObject(state, "target-legal", 0);
    addBattlefieldObject(state, "target-illegal", 1);

    const result = resolveTopOfStack(state, new Rng(state.rngSeed));
    expect(result.events[0]?.type).toBe("SPELL_RESOLVED");
  });

  it("treats missing target objects as illegal", () => {
    const state = setupStateWithStack([]);

    const validation = partitionResolvedTargets(state, [
      { kind: "object", object: { id: "missing-target", zcc: 0 } }
    ]);

    expect(validation.legalTargets).toHaveLength(0);
    expect(validation.illegalTargets).toHaveLength(1);
  });

  it("treats existing player targets as legal", () => {
    const state = setupStateWithStack([]);

    const validation = partitionResolvedTargets(state, [{ kind: "player", playerId: "p2" }]);

    expect(validation.legalTargets).toHaveLength(1);
    expect(validation.illegalTargets).toHaveLength(0);
  });

  it("treats missing player targets as illegal", () => {
    const state = setupStateWithStack([]);

    const validation = partitionResolvedTargets(state, [
      { kind: "player", playerId: "missing-player" }
    ]);

    expect(validation.legalTargets).toHaveLength(0);
    expect(validation.illegalTargets).toHaveLength(1);
  });

  it("preserves state invariants after a fizzle", () => {
    const state = setupStateWithStack([{ kind: "object", object: { id: "target-1", zcc: 0 } }]);
    addBattlefieldObject(state, "target-1", 2);

    const result = resolveTopOfStack(state, new Rng(state.rngSeed));
    expect(() => assertStateInvariants(result.state)).not.toThrow();
  });

  it("reports missing card definitions before derived activated-ability indexing", () => {
    const state = createInitialGameState("p1", "p2", {
      id: "validate-missing-card-definition",
      rngSeed: "seed-missing-card-definition"
    });
    const battlefieldZone = state.mode.resolveZone(state, "battlefield", "p1");
    const battlefieldKey = zoneKey(battlefieldZone);

    state.objectPool.set("obj-missing-def", {
      id: "obj-missing-def",
      zcc: 0,
      cardDefId: "missing-definition",
      owner: "p1",
      controller: "p1",
      counters: new Map(),
      damage: 0,
      tapped: false,
      summoningSick: false,
      attachments: [],
      abilities: [
        {
          kind: "activated",
          cost: [{ kind: "tap" }],
          effect: { kind: "add_mana", mana: { blue: 1 } },
          isManaAbility: true
        }
      ],
      zone: battlefieldZone
    });
    state.zones.set(battlefieldKey, ["obj-missing-def"]);

    expect(() =>
      validateActivateAbility(state, {
        type: "ACTIVATE_ABILITY",
        sourceId: "obj-missing-def",
        abilityIndex: 0,
        targets: []
      })
    ).toThrow("missing card definition 'missing-definition'");
  });
});
