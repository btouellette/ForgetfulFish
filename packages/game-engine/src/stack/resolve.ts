import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
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
  const currentStackZone = state.zones.get(stackKey) ?? [];

  let nextStack = state.stack.slice(0, -1);
  let nextStackZone = currentStackZone.filter((id) => id !== stackItem.object.id);

  const resolutionPayloads: GameEventPayload[] = [];

  const nextZones = new Map(state.zones);
  nextZones.set(stackKey, nextStackZone);
  const nextObjectPool = new Map(state.objectPool);

  if (
    !allTargetsIllegal &&
    cardDefinition.onResolve.includes("COUNTER") &&
    cardDefinition.onResolve.includes("MOVE_ZONE")
  ) {
    const objectTarget = stackItem.targets.find((target) => target.kind === "object");
    if (objectTarget !== undefined) {
      const targetObject = nextObjectPool.get(objectTarget.object.id);
      if (targetObject !== undefined && targetObject.zcc === objectTarget.object.zcc) {
        nextStack = nextStack.filter((item) => item.object.id !== objectTarget.object.id);
        nextStackZone = nextStackZone.filter((id) => id !== objectTarget.object.id);
        nextZones.set(stackKey, nextStackZone);

        const libraryZone = state.mode.resolveZone(state, "library", targetObject.owner);
        const libraryKey = zoneKey(libraryZone);
        const currentLibrary = nextZones.get(libraryKey) ?? [];
        nextZones.set(libraryKey, [targetObject.id, ...currentLibrary]);

        const movedTarget = bumpZcc({
          ...targetObject,
          zone: libraryZone
        });
        nextObjectPool.set(movedTarget.id, movedTarget);
        resolutionPayloads.push({
          type: "SPELL_COUNTERED",
          object: { id: movedTarget.id, zcc: movedTarget.zcc }
        });
      }
    }
  }

  const movedObject = bumpZcc({
    ...object,
    zone: destinationZone
  });
  nextObjectPool.set(movedObject.id, movedObject);

  const destinationKey = zoneKey(destinationZone);
  const currentDestination = nextZones.get(destinationKey) ?? [];
  const nextDestination = [...currentDestination, stackItem.object.id];
  nextZones.set(destinationKey, nextDestination);

  resolutionPayloads.push(
    allTargetsIllegal
      ? { type: "SPELL_COUNTERED", object: { id: movedObject.id, zcc: movedObject.zcc } }
      : { type: "SPELL_RESOLVED", object: { id: movedObject.id, zcc: movedObject.zcc } }
  );

  const nextVersion = state.version + resolutionPayloads.length;
  const nextState: GameState = {
    ...state,
    version: nextVersion,
    stack: nextStack,
    zones: nextZones,
    objectPool: nextObjectPool
  };

  return {
    state: nextState,
    events: resolutionPayloads.map((payload, index) =>
      createEvent(
        {
          engineVersion: state.engineVersion,
          schemaVersion: 1,
          gameId: state.id
        },
        state.version + index + 1,
        payload
      )
    )
  };
}
