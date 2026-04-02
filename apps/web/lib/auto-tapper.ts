import { cardRegistry, OnResolveRegistry } from "@forgetful-fish/game-engine";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

type ManaPool = PlayerGameView["viewer"]["manaPool"];
type ManaCost = NonNullable<PlayerGameView["viewer"]["hand"][number]["manaCost"]>;
type ManaProduced = NonNullable<
  PlayerGameView["legalActions"]["battlefield"][string][number]["manaProduced"]
>;

type ManaAbilityOption = {
  sourceId: string;
  abilityIndex: number;
  manaProduced: ManaProduced;
};

type SearchState = {
  visitedStates: number;
};

const maxAutoTapSearchStates = 256;

export type AutoTapPlan = {
  requiresTargets: boolean;
  activations: Array<{ sourceId: string; abilityIndex: number }>;
};

export type AutoTapHandAction = {
  requiresTargets: boolean;
};

function addManaPool(base: Readonly<ManaPool>, manaProduced: Readonly<ManaProduced>): ManaPool {
  return {
    white: base.white + (manaProduced.white ?? 0),
    blue: base.blue + (manaProduced.blue ?? 0),
    black: base.black + (manaProduced.black ?? 0),
    red: base.red + (manaProduced.red ?? 0),
    green: base.green + (manaProduced.green ?? 0),
    colorless: base.colorless + (manaProduced.colorless ?? 0) + (manaProduced.generic ?? 0)
  };
}

function hasSufficientManaPool(
  manaPool: Readonly<ManaPool>,
  manaCost: Readonly<ManaCost>
): boolean {
  const requiredWhite = manaCost.white ?? 0;
  const requiredBlue = manaCost.blue ?? 0;
  const requiredBlack = manaCost.black ?? 0;
  const requiredRed = manaCost.red ?? 0;
  const requiredGreen = manaCost.green ?? 0;
  const requiredColorless = manaCost.colorless ?? 0;
  const requiredGeneric = manaCost.generic ?? 0;

  const hasSpecificMana =
    manaPool.white >= requiredWhite &&
    manaPool.blue >= requiredBlue &&
    manaPool.black >= requiredBlack &&
    manaPool.red >= requiredRed &&
    manaPool.green >= requiredGreen &&
    manaPool.colorless >= requiredColorless;

  if (!hasSpecificMana) {
    return false;
  }

  const remainingManaAfterSpecific =
    manaPool.white -
    requiredWhite +
    (manaPool.blue - requiredBlue) +
    (manaPool.black - requiredBlack) +
    (manaPool.red - requiredRed) +
    (manaPool.green - requiredGreen) +
    (manaPool.colorless - requiredColorless);

  return remainingManaAfterSpecific >= requiredGeneric;
}

function spellRequiresTargets(cardDefId: string): boolean {
  const cardDefinition = cardRegistry.get(cardDefId);
  return cardDefinition === undefined
    ? false
    : new OnResolveRegistry(cardDefinition.onResolve).requiresObjectTargets();
}

function hasAvailableTarget(gameView: Readonly<PlayerGameView>, cardDefId: string): boolean {
  const cardDefinition = cardRegistry.get(cardDefId);
  if (cardDefinition === undefined) {
    return false;
  }

  const registry = new OnResolveRegistry(cardDefinition.onResolve);
  if (!registry.requiresObjectTargets()) {
    return true;
  }

  const hasStackTarget = registry.requiresStackObjectTargets() ? gameView.stack.length > 0 : false;
  const hasBattlefieldTarget = registry.requiresBattlefieldObjectTargets()
    ? Object.values(gameView.objectPool).some((object) => object.zone.kind === "battlefield")
    : false;

  return hasStackTarget || hasBattlefieldTarget;
}

function getAvailableManaAbilityGroups(gameView: Readonly<PlayerGameView>): ManaAbilityOption[][] {
  const groups = new Map<string, ManaAbilityOption[]>();

  for (const [sourceId, actions] of Object.entries(gameView.legalActions.battlefield)) {
    const sourceObject = gameView.objectPool[sourceId];

    if (!sourceObject || sourceObject.tapped) {
      continue;
    }

    for (const action of actions) {
      if (!action.isManaAbility || action.requiresTargets || action.manaProduced === null) {
        continue;
      }

      const existing = groups.get(sourceId) ?? [];
      existing.push({
        sourceId,
        abilityIndex: action.commandBase.abilityIndex,
        manaProduced: action.manaProduced
      });
      groups.set(sourceId, existing);
    }
  }

  return [...groups.values()];
}

function searchAutoTapPlan(
  groups: ManaAbilityOption[][],
  manaPool: Readonly<ManaPool>,
  manaCost: Readonly<ManaCost>,
  index: number,
  activations: Array<{ sourceId: string; abilityIndex: number }>,
  searchState: SearchState
): Array<{ sourceId: string; abilityIndex: number }> | null {
  searchState.visitedStates += 1;
  if (searchState.visitedStates > maxAutoTapSearchStates) {
    return null;
  }

  if (hasSufficientManaPool(manaPool, manaCost)) {
    return activations;
  }

  if (index >= groups.length) {
    return null;
  }

  const options = groups[index] ?? [];
  for (const option of options) {
    const resolved = searchAutoTapPlan(
      groups,
      addManaPool(manaPool, option.manaProduced),
      manaCost,
      index + 1,
      [...activations, { sourceId: option.sourceId, abilityIndex: option.abilityIndex }],
      searchState
    );

    if (resolved) {
      return resolved;
    }
  }

  return searchAutoTapPlan(groups, manaPool, manaCost, index + 1, activations, searchState);
}

export function getAutoTapPlan(
  gameView: Readonly<PlayerGameView>,
  cardId: string
): AutoTapPlan | null {
  const handCard = gameView.viewer.hand.find((card) => card.id === cardId);

  if (!handCard?.manaCost) {
    return null;
  }

  if (!hasAvailableTarget(gameView, handCard.cardDefId)) {
    return null;
  }

  if (hasSufficientManaPool(gameView.viewer.manaPool, handCard.manaCost)) {
    return null;
  }

  const activations = searchAutoTapPlan(
    getAvailableManaAbilityGroups(gameView),
    gameView.viewer.manaPool,
    handCard.manaCost,
    0,
    [],
    { visitedStates: 0 }
  );

  if (!activations) {
    return null;
  }

  return {
    requiresTargets: spellRequiresTargets(handCard.cardDefId),
    activations
  };
}

export function getAutoTapHandActions(
  gameView: Readonly<PlayerGameView>
): Record<string, AutoTapHandAction> {
  const autoTapActions: Record<string, AutoTapHandAction> = {};

  for (const handCard of gameView.viewer.hand) {
    const cardActions = gameView.legalActions.hand[handCard.id] ?? [];
    const hasProjectedCastAction = cardActions.some((action) => action.type === "CAST_SPELL");
    if (hasProjectedCastAction) {
      continue;
    }

    const autoTapPlan = getAutoTapPlan(gameView, handCard.id);
    if (!autoTapPlan) {
      continue;
    }

    autoTapActions[handCard.id] = { requiresTargets: autoTapPlan.requiresTargets };
  }

  return autoTapActions;
}
