import type { ReplacementId } from "../actions/action";
import type { Mode } from "../commands/command";
import type { ObjectId, PlayerId } from "../state/objectRef";

export const CHOICE_TYPES = [
  "CHOOSE_CARDS",
  "CHOOSE_TARGET",
  "CHOOSE_MODE",
  "CHOOSE_YES_NO",
  "ORDER_CARDS",
  "ORDER_TRIGGERS",
  "CHOOSE_REPLACEMENT",
  "NAME_CARD"
] as const;

export type ChoiceType = (typeof CHOICE_TYPES)[number];
export type ChoiceId = string;
export type TriggeredAbilityId = string;

export type CardFilter = {
  cardDefIds?: string[];
  typeLineIncludes?: string[];
};

export type TargetConstraint = {
  allowedKinds: Array<"object" | "player">;
  objectIds?: ObjectId[];
  playerIds?: PlayerId[];
};

export type ChoiceConstraintsByType = {
  CHOOSE_CARDS: { candidates: ObjectId[]; min: number; max: number; filter?: CardFilter };
  ORDER_CARDS: { cards: ObjectId[] };
  ORDER_TRIGGERS: { triggers: TriggeredAbilityId[] };
  NAME_CARD: Record<string, never>;
  CHOOSE_REPLACEMENT: { replacements: ReplacementId[] };
  CHOOSE_MODE: { modes: Mode[] };
  CHOOSE_TARGET: { targetConstraints: TargetConstraint };
  CHOOSE_YES_NO: { prompt: string };
};

export type ChoiceConstraints<T extends ChoiceType = ChoiceType> = ChoiceConstraintsByType[T];

export type PendingChoiceByType<T extends ChoiceType> = {
  id: ChoiceId;
  type: T;
  forPlayer: PlayerId;
  prompt: string;
  constraints: ChoiceConstraints<T>;
};

export type PendingChoice = {
  [T in ChoiceType]: PendingChoiceByType<T>;
}[ChoiceType];
