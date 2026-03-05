import { writeToScratch } from "../actions/whiteboard";
import type { ChoicePayload, MakeChoiceCommand } from "../commands/command";
import type { PendingChoice } from "./pendingChoice";
import type { GameState } from "../state/gameState";

type ResumeChoiceResult = {
  state: GameState;
  pendingChoice: PendingChoice | null;
};

function assertChoicePayload(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`choice payload ${message}`);
  }
}

function assertPayloadType<T extends ChoicePayload["type"]>(
  payload: ChoicePayload,
  expectedType: T
): asserts payload is Extract<ChoicePayload, { type: T }> {
  if (payload.type !== expectedType) {
    throw new Error("choice payload type does not match pending choice type");
  }
}

function sameItems(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftCounts = new Map<string, number>();
  for (const value of left) {
    leftCounts.set(value, (leftCounts.get(value) ?? 0) + 1);
  }

  for (const value of right) {
    const count = leftCounts.get(value);
    if (count === undefined) {
      return false;
    }

    if (count === 1) {
      leftCounts.delete(value);
    } else {
      leftCounts.set(value, count - 1);
    }
  }

  return leftCounts.size === 0;
}

function validateChoicePayload(choice: PendingChoice, payload: ChoicePayload): void {
  switch (choice.type) {
    case "CHOOSE_CARDS": {
      assertPayloadType(payload, "CHOOSE_CARDS");
      const { selected } = payload;
      assertChoicePayload(
        selected.length >= choice.constraints.min,
        "selected fewer cards than minimum"
      );
      assertChoicePayload(
        selected.length <= choice.constraints.max,
        "selected more cards than maximum"
      );
      assertChoicePayload(
        selected.every((objectId) => choice.constraints.candidates.includes(objectId)),
        "selected card is not a valid candidate"
      );
      return;
    }
    case "ORDER_CARDS": {
      assertPayloadType(payload, "ORDER_CARDS");
      assertChoicePayload(
        sameItems(payload.ordered, choice.constraints.cards),
        "ordered cards do not match required cards"
      );
      return;
    }
    case "ORDER_TRIGGERS": {
      assertPayloadType(payload, "ORDER_TRIGGERS");
      assertChoicePayload(
        sameItems(payload.triggerIds, choice.constraints.triggers),
        "ordered triggers do not match required triggers"
      );
      return;
    }
    case "NAME_CARD": {
      assertPayloadType(payload, "NAME_CARD");
      assertChoicePayload(payload.cardName.trim().length > 0, "named card must be non-empty");
      return;
    }
    case "CHOOSE_REPLACEMENT": {
      assertPayloadType(payload, "CHOOSE_REPLACEMENT");
      assertChoicePayload(
        choice.constraints.replacements.includes(payload.replacementId),
        "replacement id is not available"
      );
      return;
    }
    case "CHOOSE_MODE": {
      assertPayloadType(payload, "CHOOSE_MODE");
      assertChoicePayload(
        choice.constraints.modes.some((mode) => mode.id === payload.mode.id),
        "chosen mode is not available"
      );
      return;
    }
    case "CHOOSE_TARGET": {
      assertPayloadType(payload, "CHOOSE_TARGET");
      const allowedKinds = new Set(choice.constraints.targetConstraints.allowedKinds);
      assertChoicePayload(allowedKinds.has(payload.target.kind), "target kind is not allowed");

      if (payload.target.kind === "object") {
        const objectIds = choice.constraints.targetConstraints.objectIds;
        if (objectIds !== undefined) {
          assertChoicePayload(
            objectIds.includes(payload.target.object.id),
            "target object is not allowed"
          );
        }
        return;
      }

      const playerIds = choice.constraints.targetConstraints.playerIds;
      if (playerIds !== undefined) {
        assertChoicePayload(
          playerIds.includes(payload.target.playerId),
          "target player is not allowed"
        );
      }
      return;
    }
    case "CHOOSE_YES_NO":
      assertPayloadType(payload, "CHOOSE_YES_NO");
      return;
    default: {
      const neverChoiceType: never = choice;
      return neverChoiceType;
    }
  }
}

function getResumeStepIndex(state: Readonly<GameState>, choice: PendingChoice): number {
  const topItem = state.stack[state.stack.length - 1];
  if (topItem === undefined) {
    return 0;
  }

  const byId = topItem.effectContext.whiteboard.scratch[`resumeStepIndex:${choice.id}`];
  if (typeof byId === "number" && Number.isInteger(byId) && byId >= 0) {
    return byId;
  }

  const fallback = topItem.effectContext.whiteboard.scratch.resumeStepIndex;
  if (typeof fallback === "number" && Number.isInteger(fallback) && fallback >= 0) {
    return fallback;
  }

  return 0;
}

export function resumeChoiceResolution(
  state: Readonly<GameState>,
  command: MakeChoiceCommand
): ResumeChoiceResult {
  if (state.pendingChoice === null) {
    throw new Error("no pending choice to resolve");
  }

  if (state.turnState.priorityState.playerWithPriority !== state.pendingChoice.forPlayer) {
    throw new Error("only the pending choice player can submit MAKE_CHOICE");
  }

  validateChoicePayload(state.pendingChoice, command.payload);

  if (state.stack.length === 0) {
    throw new Error("cannot resume choice without a stack item");
  }

  const topItem = state.stack[state.stack.length - 1];
  if (topItem === undefined) {
    throw new Error("cannot resume missing top stack item");
  }

  if (topItem.effectContext.cursor.kind !== "waiting_choice") {
    throw new Error("top stack item is not waiting for a choice");
  }

  if (topItem.effectContext.cursor.choiceId !== state.pendingChoice.id) {
    throw new Error("pending choice id does not match stack cursor choice id");
  }

  const resumedContext = writeToScratch(
    topItem.effectContext,
    `choice:${state.pendingChoice.id}`,
    command.payload
  );
  const nextStep = getResumeStepIndex(state, state.pendingChoice) + 1;

  const nextStack = state.stack.slice(0, -1);
  nextStack.push({
    ...topItem,
    effectContext: {
      ...resumedContext,
      cursor: { kind: "step", index: nextStep }
    }
  });

  const nextState: GameState = {
    ...state,
    version: state.version + 1,
    stack: nextStack,
    pendingChoice: null
  };

  return {
    state: nextState,
    pendingChoice: null
  };
}
