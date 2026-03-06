import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent } from "../events/event";
import type { GameState } from "../state/gameState";
import { bumpZcc, zoneKey } from "../state/zones";

export type ResolveStackResult = {
  state: GameState;
  events: GameEvent[];
};

function isPermanentCard(typeLine: string[]): boolean {
  return typeLine.some((type) =>
    ["Artifact", "Creature", "Enchantment", "Land", "Planeswalker", "Battle"].includes(type)
  );
}

export function resolveTopOfStack(state: Readonly<GameState>): ResolveStackResult {
  if (state.stack.length === 0) {
    return { state: { ...state }, events: [] };
  }

  const stackItem = state.stack[state.stack.length - 1];
  if (stackItem === undefined) {
    return { state: { ...state }, events: [] };
  }

  const object = state.objectPool.get(stackItem.object.id);
  if (object === undefined) {
    throw new Error(`Cannot resolve missing stack object '${stackItem.object.id}'`);
  }

  const cardDefinition = cardRegistry.get(object.cardDefId);
  if (cardDefinition === undefined) {
    throw new Error(`Cannot resolve unknown card definition '${object.cardDefId}'`);
  }

  const validatedTargets = partitionResolvedTargets(state, stackItem.targets);
  const allTargetsIllegal =
    stackItem.targets.length > 0 &&
    validatedTargets.legalTargets.length === 0 &&
    validatedTargets.illegalTargets.length > 0;

  const stackZone = state.mode.resolveZone(state, "stack", stackItem.controller);
  const destinationZone = allTargetsIllegal
    ? state.mode.resolveZone(state, "graveyard", object.owner)
    : isPermanentCard(cardDefinition.typeLine)
      ? state.mode.resolveZone(state, "battlefield", stackItem.controller)
      : state.mode.resolveZone(state, "graveyard", object.owner);

  const stackKey = zoneKey(stackZone);
  const destinationKey = zoneKey(destinationZone);
  const currentStackZone = state.zones.get(stackKey) ?? [];
  const currentDestination = state.zones.get(destinationKey) ?? [];

  const nextStack = state.stack.slice(0, -1);
  const nextStackZone = currentStackZone.filter((id) => id !== stackItem.object.id);
  const nextDestination = [...currentDestination, stackItem.object.id];

  const movedObject = bumpZcc({
    ...object,
    zone: destinationZone
  });

  const nextObjectPool = new Map(state.objectPool);
  nextObjectPool.set(movedObject.id, movedObject);

  const nextZones = new Map(state.zones);
  nextZones.set(stackKey, nextStackZone);
  nextZones.set(destinationKey, nextDestination);

  const nextState: GameState = {
    ...state,
    version: state.version + 1,
    stack: nextStack,
    zones: nextZones,
    objectPool: nextObjectPool
  };

  return {
    state: nextState,
    events: [
      createEvent(
        {
          engineVersion: state.engineVersion,
          schemaVersion: 1,
          gameId: state.id
        },
        nextState.version,
        allTargetsIllegal
          ? { type: "SPELL_COUNTERED", object: { id: movedObject.id, zcc: movedObject.zcc } }
          : { type: "SPELL_RESOLVED", object: { id: movedObject.id, zcc: movedObject.zcc } }
      )
    ]
  };
}
