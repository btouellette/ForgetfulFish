import type { DealDamageAction, GameAction } from "../actions/action";
import { getComputedObjectView } from "../effects/continuous/access";
import type { GameState } from "../state/gameState";
import type { ObjectRef } from "../state/objectRef";

function toObjectRef(object: NonNullable<ReturnType<typeof getComputedObjectView>>): ObjectRef {
  return { id: object.id, zcc: object.zcc };
}

function getCombatDamageAmount(power: number | null): number {
  return power === null || power <= 0 ? 0 : power;
}

function isBattlefieldCreature(
  object: ReturnType<typeof getComputedObjectView>
): object is NonNullable<ReturnType<typeof getComputedObjectView>> {
  return (
    object !== undefined &&
    object.zone.kind === "battlefield" &&
    object.typeLine.includes("Creature")
  );
}

export function createCombatDamageActions(state: Readonly<GameState>): GameAction[] {
  const defendingPlayerId = state.players.find(
    (player) => player.id !== state.turnState.activePlayerId
  )?.id;
  if (defendingPlayerId === undefined) {
    throw new Error("combat damage requires a defending player");
  }

  const actions: GameAction[] = [];

  for (const attackerId of state.turnState.attackers) {
    const attacker = getComputedObjectView(state, attackerId);
    if (!isBattlefieldCreature(attacker)) {
      continue;
    }

    const attackerRef = toObjectRef(attacker);
    const attackerPower = getCombatDamageAmount(attacker.power);
    const blockerAssignments = state.turnState.blockers.filter(
      (assignment) => assignment.attackerId === attackerId
    );
    const blockers = blockerAssignments
      .map((assignment) => getComputedObjectView(state, assignment.blockerId))
      .filter(isBattlefieldCreature);

    for (const blocker of blockers) {
      const blockerPower = getCombatDamageAmount(blocker.power);
      if (blockerPower <= 0) {
        continue;
      }

      const blockerRef = toObjectRef(blocker);
      const blockerDamage: DealDamageAction = {
        id: `combat-damage:${blocker.id}:${attacker.id}`,
        type: "DEAL_DAMAGE",
        source: blockerRef,
        controller: blocker.controller,
        appliedReplacements: [],
        amount: blockerPower,
        target: { kind: "object", object: attackerRef }
      };
      actions.push(blockerDamage);
    }

    if (blockerAssignments.length === 0) {
      if (attackerPower <= 0) {
        continue;
      }

      actions.push({
        id: `combat-damage:${attacker.id}:player`,
        type: "DEAL_DAMAGE",
        source: attackerRef,
        controller: attacker.controller,
        appliedReplacements: [],
        amount: attackerPower,
        target: { kind: "player", playerId: defendingPlayerId }
      });
      continue;
    }

    let remainingPower = attackerPower;
    for (let index = 0; index < blockers.length && remainingPower > 0; index += 1) {
      const blocker = blockers[index];
      if (blocker === undefined) {
        continue;
      }

      const isLastBlocker = index === blockers.length - 1;
      const lethalDamage =
        blocker.toughness === null
          ? remainingPower
          : Math.max(0, blocker.toughness - blocker.damage);
      const damageAmount = isLastBlocker ? remainingPower : Math.min(remainingPower, lethalDamage);
      if (damageAmount <= 0) {
        continue;
      }

      actions.push({
        id: `combat-damage:${attacker.id}:${blocker.id}`,
        type: "DEAL_DAMAGE",
        source: attackerRef,
        controller: attacker.controller,
        appliedReplacements: [],
        amount: damageAmount,
        target: { kind: "object", object: toObjectRef(blocker) }
      });
      remainingPower -= damageAmount;
    }
  }

  return actions;
}
