import type { DeclareAttackersCommand, DeclareBlockersCommand } from "../commands/command";
import type { BasicLandType, StaticAbilityAst } from "../cards/abilityAst";
import {
  getComputedObjectAccessForObject,
  getComputedObjectView
} from "../effects/continuous/access";
import type { ContinuousEffect } from "../effects/continuous/layers";
import type { GameState } from "../state/gameState";
import { zoneKey } from "../state/zones";

function objectMustAttackIfAble(
  access: { appliedEffects: readonly ContinuousEffect[] } | null
): boolean {
  return (access?.appliedEffects ?? []).some((effect) => effect.effect.kind === "must_attack");
}

function canObjectAttackWithAccess(
  state: Readonly<GameState>,
  playerId: string,
  access: { view: ReturnType<typeof getComputedObjectView> } | null
): boolean {
  const object = access?.view;
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

export function getRequiredAttackerIds(state: Readonly<GameState>, playerId: string): string[] {
  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];

  return battlefield.filter((objectId) => {
    const access = getComputedObjectAccessForObject(state, objectId);
    if (!canObjectAttackWithAccess(state, playerId, access)) {
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
  return canObjectAttackWithAccess(state, playerId, {
    view: getComputedObjectView(state, objectId)
  });
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

  return playerControlsLandType(state, defendingPlayer.id, landType);
}

function playerControlsLandType(
  state: Readonly<GameState>,
  playerId: string,
  landType: BasicLandType
): boolean {
  const playerExists = state.players.some((player) => player.id === playerId);
  if (!playerExists) {
    return false;
  }

  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const battlefield = state.zones.get(zoneKey(battlefieldZone)) ?? [];

  return battlefield.some((objectId) => {
    const object = getComputedObjectView(state, objectId);
    if (object === undefined || object.controller !== playerId) {
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
  return canComputedObjectBlock(object, playerId);
}

function canComputedObjectBlock(
  object: ReturnType<typeof getComputedObjectView>,
  playerId: string
): boolean {
  if (object === undefined || object.controller !== playerId) {
    return false;
  }

  if (!object.typeLine.includes("Creature")) {
    return false;
  }

  if (object.zone.kind !== "battlefield") {
    return false;
  }

  return !object.tapped;
}

function hasKeyword(
  object: NonNullable<ReturnType<typeof getComputedObjectView>>,
  keyword: "flying" | "reach"
): boolean {
  return object.abilities.some(
    (ability) => ability.kind === "keyword" && ability.keyword === keyword
  );
}

function attackerHasLandwalk(
  attacker: NonNullable<ReturnType<typeof getComputedObjectView>>,
  defendingPlayerId: string,
  state: Readonly<GameState>
): boolean {
  return attacker.abilities.some(
    (ability) =>
      ability.kind === "keyword" &&
      ability.keyword === "landwalk" &&
      playerControlsLandType(state, defendingPlayerId, ability.landType)
  );
}

export function canBlockAttacker(
  state: Readonly<GameState>,
  blockerId: string,
  attackerId: string,
  playerId: string
): boolean {
  if (!state.turnState.attackers.includes(attackerId)) {
    return false;
  }

  const attacker = getComputedObjectView(state, attackerId);
  const blocker = getComputedObjectView(state, blockerId);
  if (
    attacker === undefined ||
    blocker === undefined ||
    !canComputedObjectBlock(blocker, playerId)
  ) {
    return false;
  }

  if (!attacker.typeLine.includes("Creature")) {
    return false;
  }

  if (attacker.zone.kind !== "battlefield") {
    return false;
  }

  if (attackerHasLandwalk(attacker, playerId, state)) {
    return false;
  }

  if (hasKeyword(attacker, "flying")) {
    return hasKeyword(blocker, "flying") || hasKeyword(blocker, "reach");
  }

  return true;
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

  const defendingPlayerId = playerId;
  const seenAttackers = new Set<string>();
  const seenBlockers = new Set<string>();

  for (const assignment of command.assignments) {
    if (seenAttackers.has(assignment.attackerId)) {
      throw new Error("block assignments must be unique per attacker");
    }
    seenAttackers.add(assignment.attackerId);

    if (!state.turnState.attackers.includes(assignment.attackerId)) {
      throw new Error("block assignments must reference declared attackers");
    }

    for (const blockerId of assignment.blockerIds) {
      if (seenBlockers.has(blockerId)) {
        throw new Error("a blocker cannot be assigned to multiple attackers");
      }
      seenBlockers.add(blockerId);

      if (!canBlockAttacker(state, blockerId, assignment.attackerId, defendingPlayerId)) {
        throw new Error("declared blockers must be legal blockers for their attackers");
      }
    }
  }
}
