import type { ObjectId, ObjectRef, PlayerId } from "../state/objectRef";

export const COMMAND_TYPES = [
  "CAST_SPELL",
  "ACTIVATE_ABILITY",
  "PASS_PRIORITY",
  "MAKE_CHOICE",
  "DECLARE_ATTACKERS",
  "DECLARE_BLOCKERS",
  "PLAY_LAND",
  "CONCEDE"
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export type Target = { kind: "object"; object: ObjectRef } | { kind: "player"; playerId: PlayerId };

export type Mode = {
  id: string;
  label?: string;
};

export type BlockerAssignment = {
  attackerId: ObjectId;
  blockerIds: ObjectId[];
};

export type ChoicePayload =
  | { type: "CHOOSE_CARDS"; selected: ObjectId[]; min: number; max: number }
  | { type: "ORDER_CARDS"; ordered: ObjectId[] }
  | { type: "NAME_CARD"; cardName: string }
  | { type: "CHOOSE_REPLACEMENT"; replacementId: string }
  | { type: "CHOOSE_MODE"; mode: Mode }
  | { type: "CHOOSE_TARGET"; target: Target }
  | { type: "CHOOSE_YES_NO"; accepted: boolean }
  | { type: "ORDER_TRIGGERS"; triggerIds: string[] };

export type CastSpellCommand = {
  type: "CAST_SPELL";
  cardId: ObjectId;
  targets?: Target[];
  modePick?: Mode;
};

export type ActivateAbilityCommand = {
  type: "ACTIVATE_ABILITY";
  sourceId: ObjectId;
  abilityIndex: number;
  targets?: Target[];
};

export type PassPriorityCommand = {
  type: "PASS_PRIORITY";
};

export type MakeChoiceCommand = {
  type: "MAKE_CHOICE";
  payload: ChoicePayload;
};

export type DeclareAttackersCommand = {
  type: "DECLARE_ATTACKERS";
  attackers: ObjectId[];
};

export type DeclareBlockersCommand = {
  type: "DECLARE_BLOCKERS";
  assignments: BlockerAssignment[];
};

export type PlayLandCommand = {
  type: "PLAY_LAND";
  cardId: ObjectId;
};

export type ConcedeCommand = {
  type: "CONCEDE";
};

export type Command =
  | CastSpellCommand
  | ActivateAbilityCommand
  | PassPriorityCommand
  | MakeChoiceCommand
  | DeclareAttackersCommand
  | DeclareBlockersCommand
  | PlayLandCommand
  | ConcedeCommand;
