import type { ChoiceConstraints, PendingChoice } from "../../choices/pendingChoice";
import type { ChoicePayload } from "../../commands/command";
import { pauseWithChoiceAndScratch, requireUniqueIds } from "./primitives";
import type { ResolveEffectHandlerContext, ResolveEffectResult } from "./types";

/** The choice types a resolve effect can ask for. */
export type RequestableChoiceType = "CHOOSE_CARDS" | "ORDER_CARDS" | "NAME_CARD" | "CHOOSE_MODE";

type PayloadFor<T extends RequestableChoiceType> = Extract<ChoicePayload, { type: T }>;

type PayloadGuards = {
  [T in RequestableChoiceType]: (payload: unknown) => payload is PayloadFor<T>;
};

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === "object" && payload !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

const payloadGuards: PayloadGuards = {
  CHOOSE_CARDS: (payload): payload is PayloadFor<"CHOOSE_CARDS"> =>
    isRecord(payload) && payload.type === "CHOOSE_CARDS" && isStringArray(payload.selected),
  ORDER_CARDS: (payload): payload is PayloadFor<"ORDER_CARDS"> =>
    isRecord(payload) && payload.type === "ORDER_CARDS" && isStringArray(payload.ordered),
  NAME_CARD: (payload): payload is PayloadFor<"NAME_CARD"> =>
    isRecord(payload) && payload.type === "NAME_CARD" && typeof payload.cardName === "string",
  CHOOSE_MODE: (payload): payload is PayloadFor<"CHOOSE_MODE"> =>
    isRecord(payload) &&
    payload.type === "CHOOSE_MODE" &&
    isRecord(payload.mode) &&
    typeof payload.mode.id === "string"
};

type ChoiceRequestByType<T extends RequestableChoiceType> = {
  type: T;
  storeKey: string;
  prompt: string;
  constraints: ChoiceConstraints<T>;
  /** Distinguishes this request's generated choice id within the resolving stack item. */
  idSuffix: string;
};

export type ChoiceRequest = {
  [T in RequestableChoiceType]: ChoiceRequestByType<T>;
}[RequestableChoiceType];

export type ChoiceOutcome<T extends RequestableChoiceType> =
  | { kind: "paused"; result: ResolveEffectResult }
  | { kind: "answered"; payload: PayloadFor<T> };

function buildPendingChoice(id: string, forPlayer: string, request: ChoiceRequest): PendingChoice {
  const base = { id, forPlayer, prompt: request.prompt };
  switch (request.type) {
    case "CHOOSE_CARDS":
      return { ...base, type: request.type, constraints: request.constraints };
    case "ORDER_CARDS":
      return { ...base, type: request.type, constraints: request.constraints };
    case "NAME_CARD":
      return { ...base, type: request.type, constraints: request.constraints };
    case "CHOOSE_MODE":
      return { ...base, type: request.type, constraints: request.constraints };
    default: {
      const exhaustive: never = request;
      return exhaustive;
    }
  }
}

function validatePayload(payload: ChoicePayload, storeKey: string): void {
  if (payload.type === "CHOOSE_CARDS") {
    requireUniqueIds(payload.selected, `${payload.type} payload must contain unique cards`);
  }

  if (payload.type === "ORDER_CARDS") {
    requireUniqueIds(payload.ordered, `${payload.type} payload must contain unique cards`);
  }

  if (payload.type === "NAME_CARD" && payload.cardName.trim().length === 0) {
    throw new Error(`NAME_CARD payload for '${storeKey}' must name a card`);
  }
}

/**
 * Asks the controller for a choice, pausing resolution on the first pass and returning the stored
 * answer on the pass that resumes. Every choice-producing resolve effect goes through this so the
 * pause, the scratch bookkeeping, and the payload validation exist once.
 */
export function requestChoice<R extends ChoiceRequest>(
  context: ResolveEffectHandlerContext,
  request: R
): ChoiceOutcome<R["type"]> {
  const { stackItem } = context;
  const scratch = stackItem.effectContext.whiteboard.scratch;
  const choiceIdKey = `${request.storeKey}:choiceId`;
  const storedChoiceId = scratch[choiceIdKey];

  if (typeof storedChoiceId !== "string") {
    const choiceId = `${stackItem.id}:${request.storeKey}:${request.idSuffix}`;
    const choice = buildPendingChoice(choiceId, stackItem.controller, request);

    return {
      kind: "paused",
      result: pauseWithChoiceAndScratch(context, choice, {
        [choiceIdKey]: choiceId,
        [`resumeStepIndex:${choiceId}`]: 0
      })
    };
  }

  const rawPayload = scratch[`choice:${storedChoiceId}`];
  const guard: (payload: unknown) => boolean = payloadGuards[request.type];
  if (!guard(rawPayload)) {
    throw new Error(
      `missing or malformed ${request.type} payload in scratch state for '${request.storeKey}'`
    );
  }

  // The guard looked up under `request.type` accepted the payload, which the compiler cannot
  // correlate back to the request's own type parameter.
  const payload = rawPayload as PayloadFor<R["type"]>;
  validatePayload(payload, request.storeKey);

  return { kind: "answered", payload };
}
