import { cardRegistry } from "../cards";
import { OnResolveRegistry } from "../stack/onResolveRegistry";
import type { ActivatedAbilityAst, ManaAmount } from "../cards/abilityAst";
import { getLegalCommands } from "../commands/validate";
import { computeGameObject } from "../effects/continuous/layers";
import type { DerivedGameObjectView, GameObject } from "../state/gameObject";
import type { GameState, ManaPool, PlayerInfo } from "../state/gameState";
import type { ObjectId, PlayerId } from "../state/objectRef";
import { zoneKey, type ZoneRef } from "../state/zones";
import type { Command } from "../commands/command";
import type {
  BattlefieldLegalActionView,
  GameObjectView,
  HandLegalActionView,
  LegalActionsView,
  PlayerGameView,
  ZoneView
} from "./types";

const maxManaSearchStates = 256;

function createRecord<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

function countersToRecord(counters: ReadonlyMap<string, number>): Record<string, number> {
  const record = createRecord<number>();

  for (const [counter, value] of counters.entries()) {
    record[counter] = value;
  }

  return record;
}

function toGameObjectView(object: Readonly<DerivedGameObjectView>): GameObjectView {
  const { abilities: _abilities, counters, ...rest } = object;
  const cardDefinition = cardRegistry.get(object.cardDefId);

  return {
    ...rest,
    name: cardDefinition?.name ?? object.cardDefId,
    manaCost: { ...(cardDefinition?.manaCost ?? {}) },
    rulesText: cardDefinition?.rulesText ?? "",
    counters: countersToRecord(counters)
  };
}

function isViewerHand(zone: Readonly<ZoneRef>, viewerPlayerId: PlayerId): boolean {
  return zone.kind === "hand" && zone.scope === "player" && zone.playerId === viewerPlayerId;
}

function isVisibleZone(zone: Readonly<ZoneRef>, viewerPlayerId: PlayerId): boolean {
  return zone.kind !== "library" && (zone.kind !== "hand" || isViewerHand(zone, viewerPlayerId));
}

function projectZone(
  zone: Readonly<ZoneRef>,
  objectIds: ObjectId[],
  viewerPlayerId: PlayerId
): ZoneView {
  if (zone.kind === "library") {
    return { zoneRef: zone, count: objectIds.length };
  }

  if (zone.kind === "hand" && !isViewerHand(zone, viewerPlayerId)) {
    return { zoneRef: zone, count: objectIds.length };
  }

  return {
    zoneRef: zone,
    objectIds: [...objectIds],
    count: objectIds.length
  };
}

function getPlayer(state: Readonly<GameState>, playerId: PlayerId): PlayerInfo {
  const player = state.players.find((entry) => entry.id === playerId);

  if (!player) {
    throw new Error(`player '${playerId}' is not part of state '${state.id}'`);
  }

  return player;
}

function getOpponent(state: Readonly<GameState>, viewerPlayerId: PlayerId): PlayerInfo {
  const opponent = state.players.find((entry) => entry.id !== viewerPlayerId);

  if (!opponent) {
    throw new Error(`opponent for player '${viewerPlayerId}' is missing from state '${state.id}'`);
  }

  return opponent;
}

function requireObject(state: Readonly<GameState>, objectId: ObjectId): GameObject {
  const object = state.objectPool.get(objectId);

  if (!object) {
    throw new Error(`object '${objectId}' is missing from state '${state.id}'`);
  }

  return object;
}

function requireComputedObject(
  state: Readonly<GameState>,
  objectId: ObjectId
): DerivedGameObjectView {
  requireObject(state, objectId);
  return computeGameObject(objectId, state);
}

function spellRequiresTargets(cardDefId: string): boolean {
  const cardDefinition = cardRegistry.get(cardDefId);
  return cardDefinition === undefined
    ? false
    : new OnResolveRegistry(cardDefinition.onResolve).requiresObjectTargets();
}

function isPureManaAbility(
  ability: ActivatedAbilityAst | undefined
): ability is ActivatedAbilityAst & {
  effect: { kind: "add_mana"; mana: ManaAmount };
} {
  return ability?.isManaAbility === true && ability.effect.kind === "add_mana";
}

function getActivatedAbility(
  state: Readonly<GameState>,
  sourceId: ObjectId,
  abilityIndex: number
): ActivatedAbilityAst | undefined {
  if (!state.objectPool.has(sourceId)) {
    return undefined;
  }

  return computeGameObject(sourceId, state).abilities.filter(
    (ability): ability is ActivatedAbilityAst => ability.kind === "activated"
  )[abilityIndex];
}

function addManaPool(base: Readonly<ManaPool>, mana: Readonly<ManaAmount>): ManaPool {
  return {
    white: base.white + (mana.white ?? 0),
    blue: base.blue + (mana.blue ?? 0),
    black: base.black + (mana.black ?? 0),
    red: base.red + (mana.red ?? 0),
    green: base.green + (mana.green ?? 0),
    colorless: base.colorless + (mana.colorless ?? 0) + (mana.generic ?? 0)
  };
}

function cloneStateForManaSimulation(state: Readonly<GameState>): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      manaPool: { ...player.manaPool },
      hand: [...player.hand]
    })) as GameState["players"],
    zones: new Map(state.zones),
    objectPool: new Map(state.objectPool),
    stack: [...state.stack],
    turnState: {
      ...state.turnState,
      priorityState: { ...state.turnState.priorityState },
      attackers: [...state.turnState.attackers],
      blockers: [...state.turnState.blockers]
    },
    continuousEffects: [...state.continuousEffects],
    lkiStore: new Map(state.lkiStore),
    triggerQueue: [...state.triggerQueue]
  };
}

function applyManaAbilitySimulation(
  state: GameState,
  playerId: PlayerId,
  sourceId: ObjectId,
  manaProduced: Readonly<ManaAmount>
) {
  const sourceObject = state.objectPool.get(sourceId);
  if (sourceObject !== undefined) {
    state.objectPool.set(sourceId, { ...sourceObject, tapped: true });
  }

  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  if (playerIndex >= 0) {
    const currentPlayer = state.players[playerIndex]!;
    state.players[playerIndex] = {
      ...currentPlayer,
      manaPool: addManaPool(currentPlayer.manaPool, manaProduced)
    };
  }
}

function commandBlocksAutoPass(state: Readonly<GameState>, command: Command): boolean {
  switch (command.type) {
    case "PASS_PRIORITY":
    case "CONCEDE":
      return false;
    case "ACTIVATE_ABILITY": {
      const ability = getActivatedAbility(state, command.sourceId, command.abilityIndex);
      return !isPureManaAbility(ability);
    }
    default:
      return true;
  }
}

type ManaAbilityOption = {
  sourceId: ObjectId;
  abilityIndex: number;
  manaProduced: ManaAmount;
};

function groupManaAbilityOptions(options: ManaAbilityOption[]) {
  const grouped = new Map<ObjectId, ManaAbilityOption[]>();

  for (const option of options) {
    const existing = grouped.get(option.sourceId) ?? [];
    existing.push(option);
    grouped.set(option.sourceId, existing);
  }

  return [...grouped.values()];
}

function canPotentialManaUnlockBlockingAction(
  state: Readonly<GameState>,
  legalCommands: readonly Command[],
  manaOptions: ManaAbilityOption[]
): boolean {
  if (manaOptions.length === 0) {
    return false;
  }

  if (legalCommands.some((command) => commandBlocksAutoPass(state, command))) {
    return true;
  }

  const groupedOptions = groupManaAbilityOptions(manaOptions);
  const upperBoundStates = groupedOptions.reduce(
    (total, options) => total * (options.length + 1),
    1
  );

  if (upperBoundStates > maxManaSearchStates) {
    return true;
  }

  let visitedStates = 0;

  function dfs(index: number, simulatedState: GameState): boolean {
    visitedStates += 1;
    if (visitedStates > maxManaSearchStates) {
      return true;
    }

    if (
      getLegalCommands(simulatedState).some((command) =>
        commandBlocksAutoPass(simulatedState, command)
      )
    ) {
      return true;
    }

    if (index >= groupedOptions.length) {
      return false;
    }

    if (dfs(index + 1, simulatedState)) {
      return true;
    }

    const optionsForSource = groupedOptions[index];
    if (optionsForSource === undefined) {
      return false;
    }

    for (const option of optionsForSource) {
      const nextState = cloneStateForManaSimulation(simulatedState);
      applyManaAbilitySimulation(
        nextState,
        nextState.turnState.priorityState.playerWithPriority,
        option.sourceId,
        option.manaProduced
      );

      if (dfs(index + 1, nextState)) {
        return true;
      }
    }

    return false;
  }

  return dfs(0, cloneStateForManaSimulation(state));
}

function createLegalActionsView(
  state: Readonly<GameState>,
  viewerPlayerId: PlayerId
): LegalActionsView {
  const choice = state.pendingChoice?.forPlayer === viewerPlayerId ? state.pendingChoice : null;
  const legalActions: LegalActionsView = {
    passPriority: null,
    concede: { command: { type: "CONCEDE" } },
    choice,
    hand: createRecord<HandLegalActionView[]>(),
    battlefield: createRecord<BattlefieldLegalActionView[]>(),
    hasOtherBlockingActions: false
  };

  const viewerHasPriority = state.turnState.priorityState.playerWithPriority === viewerPlayerId;
  if (!viewerHasPriority && choice === null) {
    return legalActions;
  }

  const legalCommands = getLegalCommands(state);

  const manaAbilityOptions: ManaAbilityOption[] = [];
  for (const command of legalCommands) {
    if (command.type !== "ACTIVATE_ABILITY") {
      continue;
    }

    const ability = getActivatedAbility(state, command.sourceId, command.abilityIndex);
    if (!isPureManaAbility(ability)) {
      continue;
    }

    manaAbilityOptions.push({
      sourceId: command.sourceId,
      abilityIndex: command.abilityIndex,
      manaProduced: ability.effect.mana
    });
  }

  const manaAbilitiesUnlockBlockingAction = canPotentialManaUnlockBlockingAction(
    state,
    legalCommands,
    manaAbilityOptions
  );

  for (const command of legalCommands) {
    switch (command.type) {
      case "PASS_PRIORITY":
        legalActions.passPriority = { command: { type: "PASS_PRIORITY" } };
        break;
      case "CONCEDE":
      case "MAKE_CHOICE":
        break;
      case "PLAY_LAND": {
        const existing = legalActions.hand[command.cardId] ?? [];
        existing.push({
          type: "PLAY_LAND",
          command: { type: "PLAY_LAND", cardId: command.cardId }
        });
        legalActions.hand[command.cardId] = existing;
        break;
      }
      case "CAST_SPELL": {
        const cardObject = state.objectPool.get(command.cardId);
        const existing = legalActions.hand[command.cardId] ?? [];
        existing.push({
          type: "CAST_SPELL",
          commandBase: { type: "CAST_SPELL", cardId: command.cardId },
          requiresTargets:
            cardObject === undefined ? false : spellRequiresTargets(cardObject.cardDefId),
          availableModes: []
        });
        legalActions.hand[command.cardId] = existing;
        break;
      }
      case "ACTIVATE_ABILITY": {
        const ability = getActivatedAbility(state, command.sourceId, command.abilityIndex);
        const isManaAbility = isPureManaAbility(ability);
        const existing = legalActions.battlefield[command.sourceId] ?? [];
        existing.push({
          type: "ACTIVATE_ABILITY",
          commandBase: {
            type: "ACTIVATE_ABILITY",
            sourceId: command.sourceId,
            abilityIndex: command.abilityIndex
          },
          requiresTargets: false,
          isManaAbility,
          manaProduced: isManaAbility ? ability.effect.mana : null,
          blocksAutoPass: isManaAbility ? manaAbilitiesUnlockBlockingAction : true
        });
        legalActions.battlefield[command.sourceId] = existing;
        break;
      }
      default:
        if (commandBlocksAutoPass(state, command)) {
          legalActions.hasOtherBlockingActions = true;
        }
        break;
    }
  }

  return legalActions;
}

export function projectPlayerView(
  state: Readonly<GameState>,
  viewerPlayerId: PlayerId
): PlayerGameView {
  const viewer = getPlayer(state, viewerPlayerId);
  const opponent = getOpponent(state, viewerPlayerId);
  const objectPool = createRecord<GameObjectView>() as Record<ObjectId, GameObjectView>;

  for (const [objectId, object] of state.objectPool.entries()) {
    if (isVisibleZone(object.zone, viewerPlayerId)) {
      objectPool[objectId] = toGameObjectView(computeGameObject(objectId, state));
    }
  }

  return {
    viewerPlayerId,
    stateVersion: state.version,
    turnState: {
      phase: state.turnState.phase,
      activePlayerId: state.turnState.activePlayerId,
      priorityPlayerId: state.turnState.priorityState.playerWithPriority
    },
    viewer: {
      id: viewer.id,
      life: viewer.life,
      manaPool: { ...viewer.manaPool },
      hand: viewer.hand.map((objectId) => toGameObjectView(requireComputedObject(state, objectId))),
      handCount: viewer.hand.length
    },
    opponent: {
      id: opponent.id,
      life: opponent.life,
      manaPool: { ...opponent.manaPool },
      handCount: opponent.hand.length
    },
    zones: state.zoneCatalog.map((zone) =>
      projectZone(zone, state.zones.get(zoneKey(zone)) ?? [], viewerPlayerId)
    ),
    objectPool,
    stack: state.stack.map((item) => ({ object: item.object, controller: item.controller })),
    pendingChoice: state.pendingChoice?.forPlayer === viewerPlayerId ? state.pendingChoice : null,
    legalActions: createLegalActionsView(state, viewerPlayerId)
  };
}
