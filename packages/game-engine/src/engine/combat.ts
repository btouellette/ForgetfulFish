import type { DeclareAttackersCommand, DeclareBlockersCommand } from "../commands/command";
import type { ActivatedAbilityAst, BasicLandType, StaticAbilityAst } from "../cards/abilityAst";
import { getComputedObjectAccessForObject, getComputedObjectView } from "../effects/continuous/access";
import type { ContinuousEffect } from "../effects/continuous/layers";
import type { GameState } from "../state/gameState";
import { zoneKey } from "../state/zones";

export function getEffectiveActivatedAbilities(
  state: Readonly<GameState>,
  objectId: string
): ActivatedAbilityAst[] {
  const object = getComputedObjectView(state, objectId);
  if (object === undefined) {
    return [];
  }

  return object.abilities.filter(
    (ability): ability is ActivatedAbilityAst => ability.kind === "activated"
  );
}

function objectMustAttackIfAble(
  access: { appliedEffects: readonly ContinuousEffect[] } | null
): boolean {
  return (access?.appliedEffects ?? []).some(
    (effect) => effect.effect.kind === "must_attack"
  );
}

export function getRequiredAttackerIds(state: Readonly<GameState>, playerId: string): string[] {
  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];

  return battlefield.filter((objectId) => {
    const access = getComputedObjectAccessForObject(state, objectId);
    if (access === null) {
      return false;
    }

    const object = access.view;
    if (object.controller !== playerId || !object.typeLine.includes("Creature")) {
      return false;
    }

    const attackRestrictions = object.abilities.filter(
      (ability): ability is Extract<StaticAbilityAst, { staticKind: "cant_attack_unless" }> =>
        ability.kind === "static" && ability.staticKind === "cant_attack_unless"
    );
    if (
      attackRestrictions.some(
        (ability) => !defendingPlayerControlsLandType(state, playerId, ability.condition.landType)
      )
    ) {
      return false;
    }

    if (object.tapped || object.summoningSick) {
      return false;
    }

    return objectMustAttackIfAble(access);
  });
}

export function canObjectAttack(
  state: Readonly<GameState>,
  objectId: string,
  playerId: string
): boolean {
  const object = getComputedObjectView(state, objectId);
  if (object === undefined || object.controller !== playerId) {
    return false;
  }

  if (!object.typeLine.includes("Creature")) {
    return false;
  }

  const attackRestrictions = object.abilities.filter(
    (ability): ability is Extract<StaticAbilityAst, { staticKind: "cant_attack_unless" }> =>
      ability.kind === "static" && ability.staticKind === "cant_attack_unless"
  );
  if (
    attackRestrictions.some(
      (ability) => !defendingPlayerControlsLandType(state, playerId, ability.condition.landType)
    )
  ) {
    return false;
  }

  return !object.tapped && !object.summoningSick;
}

function defendingPlayerControlsLandType(
  state: Readonly<GameState>,
  attackingPlayerId: string,
  landType: BasicLandType
): boolean {
  const defendingPlayer = state.players.find((player) => player.id !== attackingPlayerId);
  if (defendingPlayer === undefined) {
    return false;
  }

  const battlefieldZone = state.mode.resolveZone(state, "battlefield", defendingPlayer.id);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];

  return battlefield.some((objectId) => {
    const object = getComputedObjectView(state, objectId);
    if (object === undefined || object.controller !== defendingPlayer.id) {
      return false;
    }

    return object.subtypes.some(
      (subtype) => subtype.kind === "basic_land_type" && subtype.value === landType
    );
  });
}

export function canObjectBlock(
  state: Readonly<GameState>,
  objectId: string,
  playerId: string
): boolean {
  const object = getComputedObjectView(state, objectId);
  if (object === undefined || object.controller !== playerId) {
    return false;
  }

  if (!object.typeLine.includes("Creature")) {
    return false;
  }

  return !object.tapped;
}

export function hasAttackersDeclared(state: Readonly<GameState>): boolean {
  return state.turnState.attackers.length > 0;
}

export function validateDeclareAttackers(
  state: Readonly<GameState>,
  command: DeclareAttackersCommand
): void {
  const playerId = state.turnState.priorityState.playerWithPriority;
  if (state.turnState.step !== "DECLARE_ATTACKERS") {
    throw new Error("can only declare attackers during the declare attackers step");
  }

  if (state.turnState.activePlayerId !== playerId) {
    throw new Error("only the active player can declare attackers");
  }

  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];

  const seenAttackers = new Set<string>();
  for (const attackerId of command.attackers) {
    if (seenAttackers.has(attackerId)) {
      throw new Error("declared attackers must be unique");
    }
    seenAttackers.add(attackerId);

    if (!battlefield.includes(attackerId)) {
      throw new Error("declared attackers must be permanents on the battlefield");
    }

    if (!canObjectAttack(state, attackerId, playerId)) {
      throw new Error("declared attackers must be legal attackers");
    }
  }

  const missingRequiredAttackers = getRequiredAttackerIds(state, playerId).filter(
    (objectId) => !seenAttackers.has(objectId)
  );
  if (missingRequiredAttackers.length > 0) {
    throw new Error("must-attack creatures that are able to attack must be declared as attackers");
  }
}

export function validateDeclareBlockers(
  state: Readonly<GameState>,
  command: DeclareBlockersCommand
): void {
  const playerId = state.turnState.priorityState.playerWithPriority;

  if (state.turnState.step !== "DECLARE_BLOCKERS") {
    throw new Error("can only declare blockers during the declare blockers step");
  }

  if (state.turnState.activePlayerId === playerId) {
    throw new Error("only the defending player can declare blockers");
  }

  if (!hasAttackersDeclared(state)) {
    throw new Error("cannot declare blockers without declared attackers");
  }

  if (command.assignments.length > 0) {
    throw new Error("declaring specific blockers is not implemented yet");
  }
}
