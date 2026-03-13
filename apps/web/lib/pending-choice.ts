import type { GameplayPendingChoice } from "@forgetful-fish/realtime-contract";

type ParseSuccess<T> = { ok: true; value: T };
type ParseFailure = { ok: false; message: string };

type ParseResult<T> = ParseSuccess<T> | ParseFailure;

export type ChooseCardsConstraints = {
  candidates: string[];
  min: number;
  max: number;
};

export type OrderCardsConstraints = {
  cards: string[];
};

export type NameCardConstraints = Record<string, never>;

export type ParsedPendingChoice =
  | { kind: "yes_no" }
  | { kind: "choose_cards"; constraints: ChooseCardsConstraints }
  | { kind: "order_cards"; constraints: OrderCardsConstraints }
  | { kind: "name_card"; constraints: NameCardConstraints }
  | { kind: "unsupported" }
  | { kind: "invalid"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function parseChooseCardsConstraints(input: unknown): ParseResult<ChooseCardsConstraints> {
  if (!isRecord(input)) {
    return { ok: false, message: "constraints must be an object" };
  }

  const candidates = input.candidates;
  const min = input.min;
  const max = input.max;

  if (!isStringArray(candidates)) {
    return { ok: false, message: "candidates must be a string array" };
  }

  if (!isInteger(min) || !isInteger(max)) {
    return { ok: false, message: "min/max must be integer values" };
  }

  if (min < 0 || max < min) {
    return { ok: false, message: "min/max range is invalid" };
  }

  return {
    ok: true,
    value: {
      candidates,
      min,
      max
    }
  };
}

export function parseOrderCardsConstraints(input: unknown): ParseResult<OrderCardsConstraints> {
  if (!isRecord(input)) {
    return { ok: false, message: "constraints must be an object" };
  }

  const cards = input.cards;

  if (!isStringArray(cards)) {
    return { ok: false, message: "cards must be a string array" };
  }

  return {
    ok: true,
    value: {
      cards
    }
  };
}

export function parseNameCardConstraints(input: unknown): ParseResult<NameCardConstraints> {
  if (!isRecord(input) || Array.isArray(input)) {
    return { ok: false, message: "constraints must be an object" };
  }

  return {
    ok: true,
    value: {}
  };
}

export function parsePendingChoice(choice: GameplayPendingChoice): ParsedPendingChoice {
  switch (choice.type) {
    case "CHOOSE_YES_NO":
      return { kind: "yes_no" };
    case "CHOOSE_CARDS": {
      const parsed = parseChooseCardsConstraints(choice.constraints);
      return parsed.ok
        ? { kind: "choose_cards", constraints: parsed.value }
        : { kind: "invalid", message: parsed.message };
    }
    case "ORDER_CARDS": {
      const parsed = parseOrderCardsConstraints(choice.constraints);
      return parsed.ok
        ? { kind: "order_cards", constraints: parsed.value }
        : { kind: "invalid", message: parsed.message };
    }
    case "NAME_CARD": {
      const parsed = parseNameCardConstraints(choice.constraints);
      return parsed.ok
        ? { kind: "name_card", constraints: parsed.value }
        : { kind: "invalid", message: parsed.message };
    }
    default:
      return { kind: "unsupported" };
  }
}
