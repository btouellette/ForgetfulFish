import type { ObjectRef } from "../state/objectRef";

export type BasicLandType = "Plains" | "Island" | "Swamp" | "Mountain" | "Forest";

export type Color = "white" | "blue" | "black" | "red" | "green";

export type SubtypeAtom =
  | { kind: "basic_land_type"; value: BasicLandType }
  | { kind: "creature_type"; value: string }
  | { kind: "other"; value: string };

export type ColorAtom = { kind: "color"; value: Color };

export type AttackConditionAst = {
  kind: "defender_controls_land_type";
  landType: BasicLandType;
};

export type ConditionAst = AttackConditionAst;

export type Duration =
  | "permanent"
  | "until_end_of_turn"
  | "while_source_on_battlefield"
  | "until_cleanup"
  | { kind: "as_long_as"; condition: ConditionAst };

export type KeywordAbilityAst = {
  kind: "keyword";
  keyword?: "landwalk" | "flying" | "first_strike";
  landType?: BasicLandType;
};

export type StaticAbilityAst =
  | {
      kind: "static";
      staticKind?: "cant_attack_unless";
      condition?: AttackConditionAst;
    }
  | {
      kind: "static";
      staticKind?: "when_no_islands_sacrifice";
    };

export type TextChangeEffect = {
  kind: "text_change";
  fromLandType?: BasicLandType;
  toLandType?: BasicLandType;
  fromColor?: Color;
  toColor?: Color;
  target: ObjectRef;
  duration: Duration;
};

export type ResolutionStep = {
  kind: string;
  payload?: Record<string, unknown>;
};

export type ActivatedAbilityCost = { kind: "tap" } | { kind: "mana"; mana: Record<string, number> };

export type ActivatedAbilityEffect =
  | { kind: "add_mana"; mana: Record<string, number> }
  | { kind: string; payload?: Record<string, unknown> };

export type ActivatedAbilityAst = {
  kind: "activated";
  cost: ActivatedAbilityCost[];
  effect: ActivatedAbilityEffect;
  isManaAbility: boolean;
};

export type TriggerDefinitionAst = {
  kind: "trigger";
  event: string;
  condition?: ConditionAst;
  steps?: ResolutionStep[];
};

export type AbilityAst =
  | KeywordAbilityAst
  | StaticAbilityAst
  | ActivatedAbilityAst
  | TriggerDefinitionAst;
