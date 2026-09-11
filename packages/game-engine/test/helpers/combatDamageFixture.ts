import { cardRegistry } from "../../src/cards";
import type { CardDefinition } from "../../src/cards/cardDefinition";
import { dandanCardDefinition } from "../../src/cards/dandan";
import { processCommand } from "../../src/engine/processCommand";
import { Rng } from "../../src/rng/rng";
import type { GameObject } from "../../src/state/gameObject";
import { createInitialGameState, type GameState } from "../../src/state/gameState";
import { createInitialPriorityState } from "../../src/state/priorityState";
import { zoneKey } from "../../src/state/zones";

export type CombatPermanentKind = "dandan" | "test-creature" | "island";

const combatDamageTestCreatureDefinition: CardDefinition = {
  id: "combat-damage-test-creature",
  name: "Combat Damage Test Creature",
  manaCost: {},
  rulesText: "",
  typeLine: ["Creature"],
  subtypes: [{ kind: "creature_type", value: "Fish" }],
  color: ["blue"],
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

const CARD_DEF_IDS: Record<CombatPermanentKind, string> = {
  dandan: dandanCardDefinition.id,
  "test-creature": combatDamageTestCreatureDefinition.id,
  island: "island"
};

function setCombatDamagePriority(state: GameState): void {
  state.turnState.phase = "COMBAT_DAMAGE";
  state.turnState.step = "COMBAT_DAMAGE";
  state.turnState.activePlayerId = "p1";
  state.turnState.priorityState = createInitialPriorityState("p1");
  state.players[0].priority = true;
  state.players[1].priority = false;
}

export function createCombatDamageState(): GameState {
  cardRegistry.set(dandanCardDefinition.id, dandanCardDefinition);
  cardRegistry.set(combatDamageTestCreatureDefinition.id, combatDamageTestCreatureDefinition);

  const state = createInitialGameState("p1", "p2", {
    id: "combat-damage-test",
    rngSeed: "combat-damage-seed"
  });
  setCombatDamagePriority(state);

  return state;
}

export function putCombatPermanent(
  state: GameState,
  id: string,
  kind: CombatPermanentKind,
  owner: "p1" | "p2"
): GameObject {
  const cardDefId = CARD_DEF_IDS[kind];
  const object: GameObject = {
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
    zone: { kind: "battlefield", scope: "shared" }
  };
  const battlefieldKey = zoneKey({ kind: "battlefield", scope: "shared" });
  state.objectPool.set(object.id, object);
  state.zones.set(battlefieldKey, [...(state.zones.get(battlefieldKey) ?? []), object.id]);
  return object;
}

export function resolveCombatDamageStep(state: GameState) {
  const firstPass = processCommand(state, { type: "PASS_PRIORITY" }, new Rng(state.rngSeed));
  return processCommand(
    firstPass.nextState,
    { type: "PASS_PRIORITY" },
    new Rng(firstPass.nextState.rngSeed)
  );
}

export function getSharedGraveyard(state: GameState): string[] {
  return state.zones.get(zoneKey({ kind: "graveyard", scope: "shared" })) ?? [];
}
