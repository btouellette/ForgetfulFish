import { cardRegistry } from "../cards";
import { partitionResolvedTargets } from "../commands/validate";
import { createEvent, type GameEvent, type GameEventPayload } from "../events/event";
import type { GameState } from "../state/gameState";
import { captureSnapshot, lkiKey } from "../state/lki";
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

  let nextVersion = state.version;
  const resolutionEvents: GameEvent[] = [];

  const emit = (payload: GameEventPayload): void => {
    nextVersion += 1;
    resolutionEvents.push(
      createEvent(
        {
          engineVersion: state.engineVersion,
          schemaVersion: 1,
          gameId: state.id
        },
        nextVersion,
        payload
      )
    );
  };

  const nextZones = new Map(state.zones);
  nextZones.set(stackKey, nextStackZone);
  const nextObjectPool = new Map(state.objectPool);
  const nextLkiStore = new Map(state.lkiStore);
  let nextPlayers: GameState["players"] = [
    {
      ...state.players[0],
      hand: [...state.players[0].hand]
    },
    {
      ...state.players[1],
      hand: [...state.players[1].hand]
    }
  ];

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
        emit({
          type: "SPELL_COUNTERED",
          object: { id: movedTarget.id, zcc: movedTarget.zcc }
        });
      }
    }
  }

  if (!allTargetsIllegal && cardDefinition.onResolve.includes("DRAW_ACCUMULATED_KNOWLEDGE")) {
    const graveyardZone = state.mode.resolveZone(state, "graveyard", stackItem.controller);
    const graveyardCards = nextZones.get(zoneKey(graveyardZone)) ?? [];
    const accumulatedKnowledgeCount = graveyardCards.reduce((count, objectId) => {
      const graveyardObject = nextObjectPool.get(objectId);
      return graveyardObject?.cardDefId === "accumulated-knowledge" ? count + 1 : count;
    }, 0);

    const cardsToDraw = accumulatedKnowledgeCount + 1;
    const libraryZone = state.mode.resolveZone(state, "library", stackItem.controller);
    const handZone = state.mode.resolveZone(state, "hand", stackItem.controller);
    const libraryKey = zoneKey(libraryZone);
    const handKey = zoneKey(handZone);

    for (let drawIndex = 0; drawIndex < cardsToDraw; drawIndex += 1) {
      const currentLibrary = nextZones.get(libraryKey) ?? [];
      const drawnCardId = currentLibrary[0];
      if (drawnCardId === undefined) {
        nextPlayers =
          nextPlayers[0].id === stackItem.controller
            ? [
                {
                  ...nextPlayers[0],
                  attemptedDrawFromEmptyLibrary: true
                },
                nextPlayers[1]
              ]
            : [
                nextPlayers[0],
                {
                  ...nextPlayers[1],
                  attemptedDrawFromEmptyLibrary: true
                }
              ];
        nextVersion += 1;
        continue;
      }

      nextZones.set(libraryKey, currentLibrary.slice(1));
      nextZones.set(handKey, [...(nextZones.get(handKey) ?? []), drawnCardId]);

      const drawnObject = nextObjectPool.get(drawnCardId);
      if (drawnObject === undefined) {
        throw new Error(`Cannot draw missing object '${drawnCardId}' during resolution`);
      }

      const nextOwner = state.mode.determineOwner(stackItem.controller, "draw");
      const movedDrawnObject = bumpZcc({
        ...drawnObject,
        owner: nextOwner,
        controller: stackItem.controller,
        zone: handZone
      });
      nextObjectPool.set(movedDrawnObject.id, movedDrawnObject);
      nextLkiStore.set(
        lkiKey(drawnObject.id, drawnObject.zcc),
        captureSnapshot(drawnObject, drawnObject, libraryZone)
      );

      nextPlayers =
        nextPlayers[0].id === stackItem.controller
          ? [
              {
                ...nextPlayers[0],
                hand: [...nextPlayers[0].hand, drawnCardId]
              },
              nextPlayers[1]
            ]
          : [
              nextPlayers[0],
              {
                ...nextPlayers[1],
                hand: [...nextPlayers[1].hand, drawnCardId]
              }
            ];

      emit({
        type: "CARD_DRAWN",
        playerId: stackItem.controller,
        cardId: drawnCardId
      });
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

  emit(
    allTargetsIllegal
      ? { type: "SPELL_COUNTERED", object: { id: movedObject.id, zcc: movedObject.zcc } }
      : { type: "SPELL_RESOLVED", object: { id: movedObject.id, zcc: movedObject.zcc } }
  );

  const nextState: GameState = {
    ...state,
    version: nextVersion,
    players: nextPlayers,
    stack: nextStack,
    zones: nextZones,
    objectPool: nextObjectPool,
    lkiStore: nextLkiStore
  };

  return {
    state: nextState,
    events: resolutionEvents
  };
}
