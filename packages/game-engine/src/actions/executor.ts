import type { GameAction } from "./action";
import { addContinuousEffect, LAYERS } from "../effects/continuous/layers";
import type { GameEventPayload } from "../events/event";
import type { Rng } from "../rng/rng";
import type { GameState } from "../state/gameState";
import type { GameObject } from "../state/gameObject";
import { captureSnapshot, lkiKey } from "../state/lki";
import { bumpZcc, type ZoneRef, zoneKey } from "../state/zones";

function getPlayerIndex(state: Readonly<GameState>, playerId: string): 0 | 1 {
  if (state.players[0].id === playerId) {
    return 0;
  }

  if (state.players[1].id === playerId) {
    return 1;
  }

  throw new Error(`unknown player '${playerId}'`);
}

function removeFromArray(values: readonly string[], value: string): string[] {
  return values.filter((candidate) => candidate !== value);
}

function setObjectZoneAndMove(
  state: GameState,
  objectId: string,
  to: ZoneRef,
  expectedFrom?: ZoneRef,
  toIndex?: number
): GameObject | undefined {
  const object = state.objectPool.get(objectId);
  if (object === undefined) {
    return undefined;
  }

  if (expectedFrom !== undefined && zoneKey(object.zone) !== zoneKey(expectedFrom)) {
    return undefined;
  }

  const fromKey = zoneKey(object.zone);
  const toKey = zoneKey(to);

  if (fromKey !== toKey) {
    state.lkiStore.set(lkiKey(object.id, object.zcc), captureSnapshot(object, object, object.zone));
  }

  const fromZone = state.zones.get(fromKey) ?? [];
  const removedFromSource = removeFromArray(fromZone, objectId);

  if (fromKey === toKey) {
    const reordered = [...removedFromSource];
    if (toIndex === undefined || toIndex < 0 || toIndex >= reordered.length) {
      reordered.push(objectId);
    } else {
      reordered.splice(toIndex, 0, objectId);
    }
    state.zones.set(fromKey, reordered);
  } else {
    const toZone = state.zones.get(toKey) ?? [];
    const nextTo = [...toZone];
    if (toIndex === undefined || toIndex < 0 || toIndex >= nextTo.length) {
      nextTo.push(objectId);
    } else {
      nextTo.splice(toIndex, 0, objectId);
    }

    state.zones.set(fromKey, removedFromSource);
    state.zones.set(toKey, nextTo);
  }

  const moved =
    fromKey === toKey
      ? {
          ...object,
          zone: to
        }
      : bumpZcc({
          ...object,
          zone: to
        });
  state.objectPool.set(objectId, moved);

  state.players = [
    {
      ...state.players[0],
      hand: removeFromArray(state.players[0].hand, objectId)
    },
    {
      ...state.players[1],
      hand: removeFromArray(state.players[1].hand, objectId)
    }
  ];

  if (to.kind === "hand" && to.scope === "player") {
    const playerIndex = getPlayerIndex(state, to.playerId);
    const receivingPlayer = state.players[playerIndex];
    const nextHand = [...receivingPlayer.hand, objectId];
    state.players =
      playerIndex === 0
        ? [{ ...receivingPlayer, hand: nextHand }, state.players[1]]
        : [state.players[0], { ...receivingPlayer, hand: nextHand }];
  }

  return moved;
}

function drawOne(state: GameState, playerId: string): string | null {
  const libraryZone = state.mode.resolveZone(state, "library", playerId);
  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const library = state.zones.get(zoneKey(libraryZone)) ?? [];
  const top = library[0];

  if (top === undefined) {
    const playerIndex = getPlayerIndex(state, playerId);
    const player = state.players[playerIndex];
    state.players =
      playerIndex === 0
        ? [{ ...player, attemptedDrawFromEmptyLibrary: true }, state.players[1]]
        : [state.players[0], { ...player, attemptedDrawFromEmptyLibrary: true }];
    return null;
  }

  const topObject = state.objectPool.get(top);
  if (topObject === undefined) {
    return null;
  }

  const nextOwner = state.mode.determineOwner(playerId, "draw");
  state.lkiStore.set(
    lkiKey(topObject.id, topObject.zcc),
    captureSnapshot(topObject, topObject, libraryZone)
  );
  state.objectPool.set(
    top,
    bumpZcc({
      ...topObject,
      owner: nextOwner,
      controller: playerId,
      zone: handZone
    })
  );

  const remainingLibrary = library.slice(1);
  state.zones.set(zoneKey(libraryZone), remainingLibrary);
  const handCards = state.zones.get(zoneKey(handZone)) ?? [];
  state.zones.set(zoneKey(handZone), [...handCards, top]);

  const playerIndex = getPlayerIndex(state, playerId);
  const player = state.players[playerIndex];
  state.players =
    playerIndex === 0
      ? [{ ...player, hand: [...player.hand, top] }, state.players[1]]
      : [state.players[0], { ...player, hand: [...player.hand, top] }];

  return top;
}

export function applyActions(
  state: Readonly<GameState>,
  actions: readonly GameAction[],
  rng: Rng,
  emit?: (payload: GameEventPayload) => void
): GameState {
  const next: GameState = {
    ...state,
    players: [
      {
        ...state.players[0],
        hand: [...state.players[0].hand],
        manaPool: { ...state.players[0].manaPool }
      },
      {
        ...state.players[1],
        hand: [...state.players[1].hand],
        manaPool: { ...state.players[1].manaPool }
      }
    ],
    zones: new Map(state.zones),
    objectPool: new Map(state.objectPool),
    stack: [...state.stack],
    zoneCatalog: [...state.zoneCatalog],
    continuousEffects: [...state.continuousEffects],
    triggerQueue: [...state.triggerQueue],
    lkiStore: new Map(state.lkiStore)
  };

  for (const action of actions) {
    switch (action.type) {
      case "DRAW": {
        for (let index = 0; index < action.count; index += 1) {
          const drawn = drawOne(next, action.playerId);
          if (drawn !== null) {
            emit?.({
              type: "CARD_DRAWN",
              playerId: action.playerId,
              cardId: drawn
            });
          }
        }
        break;
      }
      case "MOVE_ZONE": {
        setObjectZoneAndMove(next, action.objectId, action.to, action.from, action.toIndex);
        break;
      }
      case "DEAL_DAMAGE": {
        if (action.target.kind === "player") {
          const playerIndex = getPlayerIndex(next, action.target.playerId);
          const player = next.players[playerIndex];
          next.players =
            playerIndex === 0
              ? [{ ...player, life: player.life - action.amount }, next.players[1]]
              : [next.players[0], { ...player, life: player.life - action.amount }];
          break;
        }

        const targetObject = next.objectPool.get(action.target.object.id);
        if (targetObject !== undefined && targetObject.zcc === action.target.object.zcc) {
          next.objectPool.set(targetObject.id, {
            ...targetObject,
            damage: targetObject.damage + action.amount
          });
        }
        break;
      }
      case "COUNTER": {
        const targetObject = next.objectPool.get(action.object.id);
        if (targetObject !== undefined && targetObject.zcc === action.object.zcc) {
          next.stack = next.stack.filter((item) => item.object.id !== targetObject.id);
          const stackZone = next.mode.resolveZone(next, "stack", action.controller);
          const stackKey = zoneKey(stackZone);
          const stackZoneObjects = next.zones.get(stackKey) ?? [];
          next.zones.set(stackKey, removeFromArray(stackZoneObjects, targetObject.id));

          const destination =
            action.destination ?? next.mode.resolveZone(next, "graveyard", targetObject.owner);
          const moved = setObjectZoneAndMove(
            next,
            targetObject.id,
            destination,
            stackZone,
            action.toIndex
          );
          if (moved !== undefined) {
            emit?.({
              type: "SPELL_COUNTERED",
              object: { id: moved.id, zcc: moved.zcc }
            });
          }
        }
        break;
      }
      case "SET_CONTROL": {
        const object = next.objectPool.get(action.objectId);
        if (object !== undefined) {
          const source = action.source ?? { id: object.id, zcc: object.zcc };
          const timestamp = next.version;
          const stateWithEffect = addContinuousEffect(next, {
            id: action.id,
            source,
            layer: LAYERS.CONTROL,
            timestamp,
            duration: action.duration,
            appliesTo: { kind: "object", objectId: action.objectId },
            effect: {
              kind: "set_controller",
              payload: { playerId: action.to }
            }
          });

          next.continuousEffects = stateWithEffect.continuousEffects;
        }
        break;
      }
      case "DESTROY": {
        const object = next.objectPool.get(action.objectId);
        if (object !== undefined) {
          const graveyardZone = next.mode.resolveZone(next, "graveyard", object.owner);
          setObjectZoneAndMove(next, object.id, graveyardZone);
        }
        break;
      }
      case "TAP": {
        const object = next.objectPool.get(action.objectId);
        if (object !== undefined) {
          next.objectPool.set(action.objectId, {
            ...object,
            tapped: true
          });
        }
        break;
      }
      case "UNTAP": {
        const object = next.objectPool.get(action.objectId);
        if (object !== undefined) {
          next.objectPool.set(action.objectId, {
            ...object,
            tapped: false
          });
        }
        break;
      }
      case "ADD_MANA": {
        const playerIndex = getPlayerIndex(next, action.playerId);
        const player = next.players[playerIndex];
        next.players =
          playerIndex === 0
            ? [
                {
                  ...player,
                  manaPool: {
                    white: player.manaPool.white + (action.mana.white ?? 0),
                    blue: player.manaPool.blue + (action.mana.blue ?? 0),
                    black: player.manaPool.black + (action.mana.black ?? 0),
                    red: player.manaPool.red + (action.mana.red ?? 0),
                    green: player.manaPool.green + (action.mana.green ?? 0),
                    colorless: player.manaPool.colorless + (action.mana.colorless ?? 0)
                  }
                },
                next.players[1]
              ]
            : [
                next.players[0],
                {
                  ...player,
                  manaPool: {
                    white: player.manaPool.white + (action.mana.white ?? 0),
                    blue: player.manaPool.blue + (action.mana.blue ?? 0),
                    black: player.manaPool.black + (action.mana.black ?? 0),
                    red: player.manaPool.red + (action.mana.red ?? 0),
                    green: player.manaPool.green + (action.mana.green ?? 0),
                    colorless: player.manaPool.colorless + (action.mana.colorless ?? 0)
                  }
                }
              ];
        break;
      }
      case "LOSE_LIFE": {
        const playerIndex = getPlayerIndex(next, action.playerId);
        const player = next.players[playerIndex];
        next.players =
          playerIndex === 0
            ? [{ ...player, life: player.life - action.amount }, next.players[1]]
            : [next.players[0], { ...player, life: player.life - action.amount }];
        break;
      }
      case "GAIN_LIFE": {
        const playerIndex = getPlayerIndex(next, action.playerId);
        const player = next.players[playerIndex];
        next.players =
          playerIndex === 0
            ? [{ ...player, life: player.life + action.amount }, next.players[1]]
            : [next.players[0], { ...player, life: player.life + action.amount }];
        break;
      }
      case "ADD_CONTINUOUS_EFFECT": {
        const stateWithEffect = addContinuousEffect(next, action.effect);
        next.continuousEffects = stateWithEffect.continuousEffects;
        break;
      }
      case "CREATE_TOKEN": {
        const tokenId = `token:${action.id}`;
        if (!next.objectPool.has(tokenId)) {
          const targetZone = action.zone;
          const targetKey = zoneKey(targetZone);
          next.objectPool.set(tokenId, {
            id: tokenId,
            zcc: 0,
            cardDefId: action.tokenDefId,
            owner: action.controller,
            controller: action.controller,
            counters: new Map(),
            damage: 0,
            tapped: false,
            summoningSick: true,
            attachments: [],
            abilities: [],
            zone: targetZone
          });
          next.zones.set(targetKey, [...(next.zones.get(targetKey) ?? []), tokenId]);
        }
        break;
      }
      case "SHUFFLE": {
        const key = zoneKey(action.zone);
        const zone = next.zones.get(key) ?? [];
        const shuffled = rng.shuffle(zone);
        let finalOrder = shuffled;

        if (action.topObjectId !== undefined) {
          let foundTopObject = false;
          const rest: string[] = [];

          for (const cardId of shuffled) {
            if (!foundTopObject && cardId === action.topObjectId) {
              foundTopObject = true;
              continue;
            }

            rest.push(cardId);
          }

          if (foundTopObject) {
            finalOrder = [action.topObjectId, ...rest];
          }
        }

        next.zones.set(key, finalOrder);
        emit?.({
          type: "SHUFFLED",
          zone: action.zone,
          resultOrder: finalOrder
        });
        break;
      }
      default: {
        const neverAction: never = action;
        throw new Error(`unsupported action payload '${JSON.stringify(neverAction)}'`);
      }
    }
  }

  return next;
}
