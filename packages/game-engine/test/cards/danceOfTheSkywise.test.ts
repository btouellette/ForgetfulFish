import { describe, expect, it } from "vitest";

import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { danceOfTheSkywiseCardDefinition } from "../../src/cards/dance-of-the-skywise";
import { dandanCardDefinition } from "../../src/cards/dandan";
import { processCommand } from "../../src/engine/processCommand";
import { advanceStepWithEvents } from "../../src/engine/kernel";
import { computeGameObject } from "../../src/effects/continuous/layers";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";
import { assertStateInvariants } from "../helpers/invariants";

const artifactCreatureDefinition: CardDefinition = {
  id: "test-artifact-creature",
  name: "Test Artifact Creature",
  manaCost: { blue: 1, generic: 1 },
  rulesText: "",
  typeLine: ["Artifact", "Creature"],
  subtypes: [{ kind: "creature_type", value: "Construct" }],
  color: [],
  supertypes: [],
  power: 2,
  toughness: 3,
  keywords: [],
  staticAbilities: [],
  triggeredAbilities: [],
  activatedAbilities: [],
  onResolve: [],
  continuousEffects: [],
  replacementEffects: []
};

function makeCard(
  id: string,
  cardDefId: string,
  owner: "p1" | "p2",
  zone: GameObject["zone"]
): GameObject {
  return {
    id,
    zcc: 0,
    cardDefId,
    owner,
    controller: owner,
    counters: new Map(),
    damage: 0,
    tapped: false,
    summoningSick: false,
    attachments: [],
    abilities: [],
    zone
  };
}

function setMainPhasePriority(state: GameState, playerId: "p1" | "p2"): void {
  state.turnState.phase = "MAIN_1";
  state.turnState.step = "MAIN_1";
  state.turnState.activePlayerId = playerId;
  state.turnState.priorityState = createInitialPriorityState(playerId);
  state.players[0].priority = state.players[0].id === playerId;
  state.players[1].priority = state.players[1].id === playerId;
}

function setMana(state: GameState, playerId: "p1" | "p2", blue: number, colorless: number): void {
  const player = playerId === "p1" ? state.players[0] : state.players[1];
  player.manaPool = { ...player.manaPool, blue, colorless };
}

function putInHand(state: GameState, playerId: "p1" | "p2", object: GameObject): void {
  state.objectPool.set(object.id, object);
  state.players[playerId === "p1" ? 0 : 1].hand.push(object.id);
  const handKey = zoneKey({ kind: "hand", scope: "player", playerId });
  state.zones.set(handKey, [...(state.zones.get(handKey) ?? []), object.id]);
}

function putOnBattlefield(state: GameState, object: GameObject): void {
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
}

function castAndResolveDanceScenario(
  targetCardDefId: string,
  targetOverrides?: Partial<GameObject>,
  options?: { addSupportIsland?: boolean }
) {
  cardRegistry.set(danceOfTheSkywiseCardDefinition.id, danceOfTheSkywiseCardDefinition);
  cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
  cardRegistry.set(artifactCreatureDefinition.id, artifactCreatureDefinition);

  const state = createInitialGameState("p1", "p2", {
    id: "dance-of-the-skywise",
    rngSeed: "seed-dance"
  });
  setMainPhasePriority(state, "p1");
  setMana(state, "p1", 1, 1);

  putInHand(
    state,
    "p1",
    makeCard("obj-dance", danceOfTheSkywiseCardDefinition.id, "p1", {
      kind: "hand",
      scope: "player",
      playerId: "p1"
    })
  );
  putOnBattlefield(state, {
    ...makeCard("obj-target", targetCardDefId, "p1", { kind: "battlefield", scope: "shared" }),
    ...targetOverrides
  });
  if (options?.addSupportIsland === true) {
    putOnBattlefield(
      state,
      makeCard("obj-support-island", "island", "p1", { kind: "battlefield", scope: "shared" })
    );
  }

  const castDance = processCommand(
    state,
    {
      type: "CAST_SPELL",
      cardId: "obj-dance",
      targets: [{ kind: "object", object: { id: "obj-target", zcc: 0 } }]
    },
    new Rng(state.rngSeed)
  );
  const passP1 = processCommand(
    castDance.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(castDance.nextState.rngSeed)
  );
  const resolveDance = processCommand(
    passP1.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(passP1.nextState.rngSeed)
  );

  return {
    initial: state,
    castDance,
    resolved: resolveDance
  };
}

describe("cards/dance-of-the-skywise", () => {
  it("loads as a 2-mana blue instant", () => {
    expect(danceOfTheSkywiseCardDefinition.id).toBe("dance-of-the-skywise");
    expect(danceOfTheSkywiseCardDefinition.manaCost).toEqual({ blue: 1, generic: 1 });
    expect(danceOfTheSkywiseCardDefinition.typeLine).toEqual(["Instant"]);
    expect(danceOfTheSkywiseCardDefinition.color).toEqual(["blue"]);
  });

  it("can be cast targeting a creature you control", () => {
    const { castDance } = castAndResolveDanceScenario(dandanCardDefinition.id, undefined, {
      addSupportIsland: true
    });
    const top = castDance.nextState.stack[castDance.nextState.stack.length - 1];

    expect(top?.object.id).toBe("obj-dance");
    expect(top?.targets[0]).toEqual({ kind: "object", object: { id: "obj-target", zcc: 0 } });
  });

  it("creates until-end-of-turn continuous effects for type, color, abilities, and base P/T", () => {
    const { resolved } = castAndResolveDanceScenario(dandanCardDefinition.id, undefined, {
      addSupportIsland: true
    });

    expect(
      resolved.nextState.continuousEffects.filter(
        (effect) =>
          effect.appliesTo.kind === "object" &&
          effect.appliesTo.object.id === "obj-target" &&
          effect.duration === "until_end_of_turn"
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          layer: 4,
          effect: expect.objectContaining({ kind: "type_change" })
        }),
        expect.objectContaining({
          layer: 5,
          effect: expect.objectContaining({ kind: "set_color" })
        }),
        expect.objectContaining({
          layer: 6,
          effect: expect.objectContaining({ kind: "remove_all_abilities" })
        }),
        expect.objectContaining({
          layer: 6,
          effect: expect.objectContaining({ kind: "grant_keyword" })
        }),
        expect.objectContaining({
          layer: "7a",
          effect: expect.objectContaining({ kind: "set_pt" })
        })
      ])
    );
  });

  it("makes the target blue, Dragon and Illusion, with only flying and base 4/4", () => {
    const { resolved } = castAndResolveDanceScenario(dandanCardDefinition.id, undefined, {
      addSupportIsland: true
    });
    const computed = computeGameObject("obj-target", resolved.nextState);

    expect(computed.color).toEqual(["blue"]);
    expect(computed.typeLine).toEqual(["Creature"]);
    expect(computed.subtypes).toEqual([
      { kind: "creature_type", value: "Dragon" },
      { kind: "creature_type", value: "Illusion" }
    ]);
    expect(computed.abilities).toEqual([{ kind: "keyword", keyword: "flying" }]);
    expect(computed.power).toBe(4);
    expect(computed.toughness).toBe(4);
  });

  it("preserves noncreature card types while replacing creature subtypes", () => {
    const { resolved } = castAndResolveDanceScenario(artifactCreatureDefinition.id);
    const computed = computeGameObject("obj-target", resolved.nextState);

    expect(computed.typeLine).toEqual(["Artifact", "Creature"]);
    expect(computed.subtypes).toEqual([
      { kind: "creature_type", value: "Dragon" },
      { kind: "creature_type", value: "Illusion" }
    ]);
  });

  it("expires at cleanup and restores the target's original characteristics", () => {
    const { resolved } = castAndResolveDanceScenario(dandanCardDefinition.id, undefined, {
      addSupportIsland: true
    });
    const cleanupState: GameState = {
      ...resolved.nextState,
      turnState: {
        ...resolved.nextState.turnState,
        phase: "CLEANUP",
        step: "CLEANUP"
      }
    };

    const nextTurnState = advanceStepWithEvents(cleanupState, new Rng(cleanupState.rngSeed)).state;
    const computed = computeGameObject("obj-target", nextTurnState);

    expect(nextTurnState.continuousEffects).toHaveLength(0);
    expect(computed.color).toEqual(["blue"]);
    expect(computed.typeLine).toEqual(["Creature"]);
    expect(computed.subtypes).toEqual([{ kind: "creature_type", value: "Fish" }]);
    expect(computed.abilities).toEqual([
      { kind: "keyword", keyword: "landwalk", landType: "Island" },
      {
        kind: "static",
        staticKind: "cant_attack_unless",
        condition: { kind: "defender_controls_land_type", landType: "Island" }
      },
      {
        kind: "static",
        staticKind: "when_no_islands_sacrifice",
        landType: "Island"
      }
    ]);
    expect(computed.power).toBe(4);
    expect(computed.toughness).toBe(1);
  });

  it("applies +1/+1 counters after setting base power and toughness to 4/4", () => {
    const { resolved } = castAndResolveDanceScenario(
      dandanCardDefinition.id,
      {
        counters: new Map([["+1/+1", 1]])
      },
      {
        addSupportIsland: true
      }
    );
    const computed = computeGameObject("obj-target", resolved.nextState);

    expect(computed.power).toBe(5);
    expect(computed.toughness).toBe(5);
  });

  it("preserves state invariants after resolution", () => {
    const { resolved } = castAndResolveDanceScenario(dandanCardDefinition.id, undefined, {
      addSupportIsland: true
    });

    expect(() => assertStateInvariants(resolved.nextState)).not.toThrow();
  });
});
