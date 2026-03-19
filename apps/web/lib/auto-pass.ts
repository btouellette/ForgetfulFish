import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

type ManaCost = {
  white?: number;
  blue?: number;
  black?: number;
  red?: number;
  green?: number;
  colorless?: number;
  generic?: number;
};

type SpellRule = {
  cost: ManaCost;
  requiresStackTarget?: boolean;
};

export type AutoPassAssessment = {
  hasApparentAction: boolean;
  hasUncertainAction: boolean;
};

const knownSpellRules: Record<string, SpellRule> = {
  "accumulated-knowledge": { cost: { blue: 1, generic: 1 } },
  brainstorm: { cost: { blue: 1 } },
  "memory-lapse": { cost: { blue: 1, generic: 1 }, requiresStackTarget: true },
  "mystical-tutor": { cost: { blue: 1 } },
  predict: { cost: { blue: 1, generic: 1 } }
};

function countUntappedViewerIslands(gameView: PlayerGameView): number {
  return Object.values(gameView.objectPool).filter(
    (object) =>
      object.zone.kind === "battlefield" &&
      object.controller === gameView.viewerPlayerId &&
      object.cardDefId === "island" &&
      !object.tapped
  ).length;
}

function hasSufficientApparentMana(
  manaPool: PlayerGameView["viewer"]["manaPool"],
  untappedViewerIslands: number,
  cost: ManaCost
) {
  const requiredWhite = cost.white ?? 0;
  const requiredBlue = cost.blue ?? 0;
  const requiredBlack = cost.black ?? 0;
  const requiredRed = cost.red ?? 0;
  const requiredGreen = cost.green ?? 0;
  const requiredColorless = cost.colorless ?? 0;
  const requiredGeneric = cost.generic ?? 0;

  const availableWhite = manaPool.white;
  const availableBlue = manaPool.blue + untappedViewerIslands;
  const availableBlack = manaPool.black;
  const availableRed = manaPool.red;
  const availableGreen = manaPool.green;
  const availableColorless = manaPool.colorless;

  const hasSpecificMana =
    availableWhite >= requiredWhite &&
    availableBlue >= requiredBlue &&
    availableBlack >= requiredBlack &&
    availableRed >= requiredRed &&
    availableGreen >= requiredGreen &&
    availableColorless >= requiredColorless;

  if (!hasSpecificMana) {
    return false;
  }

  const remainingManaAfterSpecific =
    availableWhite -
    requiredWhite +
    (availableBlue - requiredBlue) +
    (availableBlack - requiredBlack) +
    (availableRed - requiredRed) +
    (availableGreen - requiredGreen) +
    (availableColorless - requiredColorless);

  return remainingManaAfterSpecific >= requiredGeneric;
}

export function assessAutoPass(gameView: PlayerGameView): AutoPassAssessment {
  const untappedViewerIslands = countUntappedViewerIslands(gameView);

  for (const card of gameView.viewer.hand) {
    if (card.cardDefId === "island") {
      return { hasApparentAction: true, hasUncertainAction: false };
    }

    const spellRule = knownSpellRules[card.cardDefId];
    if (!spellRule) {
      return { hasApparentAction: false, hasUncertainAction: true };
    }

    if (spellRule.requiresStackTarget && gameView.stack.length === 0) {
      continue;
    }

    if (
      hasSufficientApparentMana(gameView.viewer.manaPool, untappedViewerIslands, spellRule.cost)
    ) {
      return { hasApparentAction: true, hasUncertainAction: false };
    }
  }

  const hasUnknownBattlefieldPermanent = Object.values(gameView.objectPool).some(
    (object) =>
      object.zone.kind === "battlefield" &&
      object.controller === gameView.viewerPlayerId &&
      object.cardDefId !== "island"
  );

  if (hasUnknownBattlefieldPermanent) {
    return { hasApparentAction: false, hasUncertainAction: true };
  }

  return { hasApparentAction: false, hasUncertainAction: false };
}

export function shouldAutoPass(gameView: PlayerGameView): boolean {
  const assessment = assessAutoPass(gameView);
  return !assessment.hasApparentAction && !assessment.hasUncertainAction;
}
