import type { Duration } from "./abilityAst";
import type { ContinuousEffectPayload, Layer } from "../effects/continuous/layers";
import type { Mode } from "../commands/command";

export type ResolveStoredValueKey = string;
export type ResolveTargetObjectSelector = "first_object_target";
export type ResolvePlayerSelector = "controller" | "target_player_or_controller";
export type ResolveZoneSelector = "hand" | "library" | "graveyard";

export type DrawCardsSpec = {
  kind: "draw_cards";
  count: number;
  player: ResolvePlayerSelector;
};

export type ChooseCardsSpec = {
  kind: "choose_cards";
  zone: Extract<ResolveZoneSelector, "hand" | "library">;
  player: "controller";
  min: number;
  max: number;
  prompt: string;
  storeKey: ResolveStoredValueKey;
  typeFilter?: string[];
};

export type OrderCardsSpec = {
  kind: "order_cards";
  sourceKey: ResolveStoredValueKey;
  prompt: string;
  storeKey: ResolveStoredValueKey;
};

export type MoveOrderedCardsSpec = {
  kind: "move_ordered_cards";
  sourceKey: ResolveStoredValueKey;
  fromZone: Extract<ResolveZoneSelector, "hand">;
  toZone: Extract<ResolveZoneSelector, "library">;
  player: "controller";
  placement: "top";
};

export type NameCardSpec = {
  kind: "name_card";
  prompt: string;
  storeKey: ResolveStoredValueKey;
};

export type ChooseModeSpec = {
  kind: "choose_mode";
  prompt: string;
  storeKey: ResolveStoredValueKey;
  modeSource:
    | { kind: "explicit"; modes: Mode[] }
    | { kind: "target_land_types"; target: ResolveTargetObjectSelector }
    | { kind: "basic_land_types"; excludeStoreKey?: ResolveStoredValueKey };
};

export type MillCardsSpec = {
  kind: "mill_cards";
  count: number;
  player: ResolvePlayerSelector;
  storeKey: ResolveStoredValueKey;
};

export type DrawByNamedHitSpec = {
  kind: "draw_by_named_hit";
  namedCardKey: ResolveStoredValueKey;
  milledCardsKey: ResolveStoredValueKey;
  hitCount: number;
  missCount: number;
};

export type CounterTargetSpellSpec = {
  kind: "counter_target_spell";
  destination: "graveyard" | "library-top";
};

export type DrawByGraveyardSelfCountSpec = {
  kind: "draw_by_graveyard_self_count";
  bonus: number;
};

export type SetControlOfTargetSpec = {
  kind: "set_control_of_target";
  target: ResolveTargetObjectSelector;
  duration: Duration;
};

export type UntapTargetSpec = {
  kind: "untap_target";
  target: ResolveTargetObjectSelector;
};

export type AddContinuousEffectToTargetSpec = {
  kind: "add_continuous_effect_to_target";
  target: ResolveTargetObjectSelector;
  layer: Layer;
  duration: Duration;
  effect: ContinuousEffectPayload;
};

export type AddTextChangeEffectToTargetSpec = {
  kind: "add_text_change_effect_to_target";
  target: ResolveTargetObjectSelector;
  duration: Duration;
  fromKey: ResolveStoredValueKey;
  toKey: ResolveStoredValueKey;
};

export type ShuffleZoneSpec = {
  kind: "shuffle_zone";
  zone: Extract<ResolveZoneSelector, "library">;
  player: "controller";
  topCardFromKey?: ResolveStoredValueKey;
};

export type ResolveEffectSpec =
  | DrawCardsSpec
  | ChooseCardsSpec
  | OrderCardsSpec
  | MoveOrderedCardsSpec
  | NameCardSpec
  | ChooseModeSpec
  | MillCardsSpec
  | DrawByNamedHitSpec
  | CounterTargetSpellSpec
  | DrawByGraveyardSelfCountSpec
  | SetControlOfTargetSpec
  | UntapTargetSpec
  | AddContinuousEffectToTargetSpec
  | AddTextChangeEffectToTargetSpec
  | ShuffleZoneSpec;

export type ResolveEffectKind = ResolveEffectSpec["kind"];
