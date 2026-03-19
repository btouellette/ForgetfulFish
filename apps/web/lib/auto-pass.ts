import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

export type AutoPassAssessment = {
  hasApparentAction: boolean;
  hasUncertainAction: boolean;
};

function hasActionEntries<T>(record: Record<string, T[]>): boolean {
  return Object.values(record).some((actions) => actions.length > 0);
}

function hasBlockingBattlefieldAction(gameView: PlayerGameView): boolean {
  return Object.values(gameView.legalActions.battlefield).some((actions) =>
    actions.some((action) => action.blocksAutoPass)
  );
}

function hasNonPassAction(gameView: PlayerGameView): boolean {
  return (
    gameView.legalActions.choice !== null ||
    hasActionEntries(gameView.legalActions.hand) ||
    hasBlockingBattlefieldAction(gameView)
  );
}

export function assessAutoPass(gameView: PlayerGameView): AutoPassAssessment {
  return {
    hasApparentAction: hasNonPassAction(gameView),
    hasUncertainAction: false
  };
}

export function shouldAutoPass(gameView: PlayerGameView): boolean {
  return !hasNonPassAction(gameView);
}
