import type { GameState } from "../../state/gameState";
import type { StackItem } from "../stackItem";
import type { PauseResult, ResolveEffectResult } from "./types";

type PauseContext = {
  stackItem: StackItem;
  pauseWithChoice: (
    choice: NonNullable<GameState["pendingChoice"]>,
    updatedTopItem: StackItem
  ) => PauseResult;
};

export function pauseWithChoiceAndScratch(
  context: PauseContext,
  choice: NonNullable<GameState["pendingChoice"]>,
  scratch: Record<string, unknown>
): ResolveEffectResult {
  const updatedTopItem: StackItem = {
    ...context.stackItem,
    effectContext: {
      ...context.stackItem.effectContext,
      cursor: { kind: "waiting_choice", choiceId: choice.id },
      whiteboard: {
        ...context.stackItem.effectContext.whiteboard,
        scratch: {
          ...context.stackItem.effectContext.whiteboard.scratch,
          ...scratch
        }
      }
    }
  };

  return {
    kind: "pause",
    result: context.pauseWithChoice(choice, updatedTopItem)
  };
}

export function requireUniqueIds(values: readonly string[], message: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(message);
  }
}
