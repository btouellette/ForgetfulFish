import type { ChoicePayload } from "../../commands/command";
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

export function requireChoicePayload<T extends ChoicePayload>(
  stackItem: StackItem,
  choiceIdScratchKey: string,
  parser: (payload: unknown) => payload is T,
  missingChoiceIdMessage: string,
  missingPayloadMessage: string
): T {
  const choiceId = stackItem.effectContext.whiteboard.scratch[choiceIdScratchKey];
  if (typeof choiceId !== "string") {
    throw new Error(missingChoiceIdMessage);
  }

  const rawPayload = stackItem.effectContext.whiteboard.scratch[`choice:${choiceId}`];
  if (!parser(rawPayload)) {
    throw new Error(missingPayloadMessage);
  }

  return rawPayload;
}
