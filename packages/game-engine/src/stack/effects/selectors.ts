import { cardRegistry } from "../../cards";
import type {
  ResolveAmount,
  ResolveCardFilter,
  ResolveCardsSelector,
  ResolveCondition,
  ResolvePlayerSelector,
  ResolveTargetObjectSelector,
  ResolveZoneOwnerSelector,
  ResolveZoneSelector
} from "../../cards/resolveEffect";
import type { Target } from "../../commands/command";
import { getComputedObjectView } from "../../effects/continuous/access";
import type { GameState } from "../../state/gameState";
import type { ObjectRef, PlayerId } from "../../state/objectRef";
import { zoneKey, type ZoneRef } from "../../state/zones";
import type { ResolveEffectHandlerContext, ResolveMutableState } from "./types";

/** The game state as it stands mid-resolution, with already-flushed actions applied. */
export function snapshotState(
  state: Readonly<GameState>,
  mutable: Readonly<ResolveMutableState>,
  version: number
): GameState {
  return {
    ...state,
    version,
    players: mutable.nextPlayers,
    stack: mutable.nextStack,
    zones: mutable.nextZones,
    objectPool: mutable.nextObjectPool,
    continuousEffects: mutable.nextContinuousEffects,
    lkiStore: mutable.nextLkiStore,
    pendingChoice: null
  };
}

function currentState(context: ResolveEffectHandlerContext): GameState {
  return snapshotState(context.state, context.mutable, context.state.version);
}

export function otherPlayerId(state: Readonly<GameState>, playerId: PlayerId): PlayerId {
  const other = state.players.find((player) => player.id !== playerId);
  if (other === undefined) {
    throw new Error(`no opponent found for player '${playerId}'`);
  }

  return other.id;
}

export function resolvePlayerId(
  context: ResolveEffectHandlerContext,
  player: ResolvePlayerSelector
): PlayerId {
  switch (player) {
    case "controller":
      return context.stackItem.controller;
    case "opponent":
      return otherPlayerId(context.state, context.stackItem.controller);
    case "target_player_or_controller": {
      const playerTarget = context.stackItem.targets.find((target) => target.kind === "player");
      return playerTarget?.playerId ?? context.stackItem.controller;
    }
    case "iterated_player": {
      if (context.bindings.iteratedPlayer === undefined) {
        throw new Error("'iterated_player' is only valid inside a per-player step");
      }

      return context.bindings.iteratedPlayer;
    }
    default: {
      const exhaustive: never = player;
      return exhaustive;
    }
  }
}

export function resolveZoneRef(
  context: ResolveEffectHandlerContext,
  zone: ResolveZoneSelector,
  playerId: PlayerId
): ZoneRef {
  return context.state.mode.resolveZone(context.state, zone, playerId);
}

export function resolveZoneRefs(
  context: ResolveEffectHandlerContext,
  zone: ResolveZoneSelector,
  owner: ResolveZoneOwnerSelector
): ZoneRef[] {
  const playerIds =
    owner === "all_players"
      ? context.state.players.map((player) => player.id)
      : [resolvePlayerId(context, owner)];
  const seen = new Set<string>();
  const zones: ZoneRef[] = [];

  for (const playerId of playerIds) {
    const zoneRef = resolveZoneRef(context, zone, playerId);
    const key = zoneKey(zoneRef);
    if (!seen.has(key)) {
      seen.add(key);
      zones.push(zoneRef);
    }
  }

  return zones;
}

export function resolveTargetObject(
  context: ResolveEffectHandlerContext,
  target: ResolveTargetObjectSelector
): Extract<Target, { kind: "object" }> | undefined {
  if (target !== "first_object_target") {
    throw new Error(`unsupported target selector '${target}'`);
  }

  return context.stackItem.targets.find((candidate) => candidate.kind === "object");
}

export function readStoredStringArray(
  context: ResolveEffectHandlerContext,
  key: string,
  message: string
): string[] {
  const stored = context.stackItem.effectContext.whiteboard.scratch[key];
  if (!Array.isArray(stored) || !stored.every((value) => typeof value === "string")) {
    throw new Error(message);
  }

  return [...stored];
}

export function readStoredString(
  context: ResolveEffectHandlerContext,
  key: string,
  message: string
): string {
  const stored = context.stackItem.effectContext.whiteboard.scratch[key];
  if (typeof stored !== "string") {
    throw new Error(message);
  }

  return stored;
}

export function readOptionalStoredString(
  context: ResolveEffectHandlerContext,
  key: string
): string | null {
  const stored = context.stackItem.effectContext.whiteboard.scratch[key];
  return typeof stored === "string" ? stored : null;
}

function cardName(context: ResolveEffectHandlerContext, objectId: string): string | undefined {
  const object = context.mutable.nextObjectPool.get(objectId);
  return object === undefined ? undefined : cardRegistry.get(object.cardDefId)?.name;
}

function matchesFilter(
  context: ResolveEffectHandlerContext,
  state: GameState,
  objectId: string,
  filter: ResolveCardFilter
): boolean {
  if (filter.types !== undefined) {
    const typeLine = getComputedObjectView(state, objectId)?.typeLine ?? [];
    if (!typeLine.some((type) => filter.types?.includes(type))) {
      return false;
    }
  }

  if (filter.landType !== undefined) {
    const expected = readStoredString(
      context,
      filter.landType.storeKey,
      `missing stored land type '${filter.landType.storeKey}' in scratch state`
    );
    const subtypes = getComputedObjectView(state, objectId)?.subtypes ?? [];
    if (
      !subtypes.some((subtype) => subtype.kind === "basic_land_type" && subtype.value === expected)
    ) {
      return false;
    }
  }

  if (
    filter.sameCardAsSource === true &&
    context.mutable.nextObjectPool.get(objectId)?.cardDefId !== context.cardDefinition.id
  ) {
    return false;
  }

  if (filter.name !== undefined) {
    const expected = readStoredString(
      context,
      filter.name.storeKey,
      `missing stored card name '${filter.name.storeKey}' in scratch state`
    );
    const actual = cardName(context, objectId);
    if (actual === undefined || actual.trim().toLowerCase() !== expected.trim().toLowerCase()) {
      return false;
    }
  }

  return true;
}

function selectUnfilteredCards(
  context: ResolveEffectHandlerContext,
  selector: ResolveCardsSelector
): string[] {
  switch (selector.kind) {
    case "stored":
      return readStoredStringArray(
        context,
        selector.storeKey,
        `missing stored cards '${selector.storeKey}' in scratch state`
      );
    case "zone":
      return resolveZoneRefs(context, selector.zone, selector.player).flatMap(
        (zone) => context.mutable.nextZones.get(zoneKey(zone)) ?? []
      );
    case "top_of_library": {
      const library = resolveZoneRef(context, "library", resolvePlayerId(context, selector.player));
      const cards = context.mutable.nextZones.get(zoneKey(library)) ?? [];
      return cards.slice(0, evaluateAmount(context, selector.count));
    }
    case "target_object": {
      const target = resolveTargetObject(context, "first_object_target");
      return target === undefined ? [] : [target.object.id];
    }
    default: {
      const exhaustive: never = selector;
      return exhaustive;
    }
  }
}

/** Resolves a card selector to object ids present in the current (mid-resolution) state. */
export function resolveCards(
  context: ResolveEffectHandlerContext,
  selector: ResolveCardsSelector
): string[] {
  const cards = selectUnfilteredCards(context, selector).filter((objectId) =>
    context.mutable.nextObjectPool.has(objectId)
  );
  if (selector.filter === undefined) {
    return cards;
  }

  const filter = selector.filter;
  const state = currentState(context);
  return cards.filter((objectId) => matchesFilter(context, state, objectId, filter));
}

export function resolveObjectRefs(
  context: ResolveEffectHandlerContext,
  selector: ResolveCardsSelector
): ObjectRef[] {
  return resolveCards(context, selector).flatMap((objectId) => {
    const object = context.mutable.nextObjectPool.get(objectId);
    return object === undefined ? [] : [{ id: object.id, zcc: object.zcc }];
  });
}

export function evaluateAmount(
  context: ResolveEffectHandlerContext,
  amount: ResolveAmount
): number {
  if (typeof amount === "number") {
    return Math.max(0, amount);
  }

  switch (amount.kind) {
    case "count":
      return resolveCards(context, amount.cards).length;
    case "plus":
      return amount.terms.reduce<number>((total, term) => total + evaluateAmount(context, term), 0);
    case "minus":
      return Math.max(
        0,
        evaluateAmount(context, amount.from) - evaluateAmount(context, amount.subtract)
      );
    default: {
      const exhaustive: never = amount;
      return exhaustive;
    }
  }
}

export function evaluateCondition(
  context: ResolveEffectHandlerContext,
  condition: ResolveCondition
): boolean {
  switch (condition.kind) {
    case "cards_not_empty":
      return resolveCards(context, condition.cards).length > 0;
    case "stored_equals":
      return readOptionalStoredString(context, condition.storeKey) === condition.value;
    case "has_target":
      return context.stackItem.targets.some((target) => target.kind === condition.target);
    case "not":
      return !evaluateCondition(context, condition.condition);
    default: {
      const exhaustive: never = condition;
      return exhaustive;
    }
  }
}
