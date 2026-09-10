import type { Duration } from "./abilityAst";
import type { ContinuousEffectPayload, Layer } from "../effects/continuous/layers";
import type { Mode } from "../commands/command";

export type ResolveStoredValueKey = string;
export type ResolveTargetObjectSelector = "first_object_target";
export type ResolvePlayerSelector =
  | "controller"
  | "target_player_or_controller"
  | "iteration_player";
export type ResolveZoneSelector = "hand" | "library" | "graveyard";

/** An arithmetic expression evaluated against the game state at resolution time. */
export type ResolveValue =
  | { kind: "literal"; value: number }
  | { kind: "scratch_number"; key: ResolveStoredValueKey }
  | { kind: "zone_size"; zone: ResolveZoneSelector; player: ResolvePlayerSelector }
  | {
      kind: "count_in_zone";
      zone: ResolveZoneSelector;
      player: ResolvePlayerSelector;
      filter?:
        | { kind: "same_card_definition_as_source" }
        | { kind: "card_definition"; cardDefId: string };
    }
  | { kind: "sum"; values: ResolveValue[] }
  | { kind: "subtract"; left: ResolveValue; right: ResolveValue }
  | { kind: "clamp"; value: ResolveValue; min?: number; max?: number };

export type ResolveCount = number | ResolveValue;

export type DrawCardsSpec = {
  kind: "draw_cards";
  count: ResolveCount;
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
  selectedLandTypeStoreKey?: ResolveStoredValueKey;
  modeSource:
    | { kind: "explicit"; modes: Mode[] }
    | { kind: "target_land_types"; target: ResolveTargetObjectSelector }
    | { kind: "target_land_type_instances"; target: ResolveTargetObjectSelector }
    | { kind: "basic_land_types"; excludeStoreKey?: ResolveStoredValueKey };
};

export type MoveZoneContentsSpec = {
  kind: "move_zone_contents";
  fromZone: Extract<ResolveZoneSelector, "hand" | "graveyard">;
  toZone: Extract<ResolveZoneSelector, "library">;
  player: ResolvePlayerSelector;
};

export type ExileFromLibraryTopSpec = {
  kind: "exile_from_library_top";
  count: ResolveCount;
  player: ResolvePlayerSelector;
};

export type AddSubtypeFromChoiceToTargetSpec = {
  kind: "add_subtype_from_choice_to_target";
  target: ResolveTargetObjectSelector;
  /** Scratch key holding the subtype chosen earlier in the same resolution. */
  subtypeKey: ResolveStoredValueKey;
  duration: Duration;
};

export type MillCardsSpec = {
  kind: "mill_cards";
  count: number;
  player: ResolvePlayerSelector;
  storeKey: ResolveStoredValueKey;
};

export type CounterTargetSpellSpec = {
  kind: "counter_target_spell";
  destination: "graveyard" | "library-top";
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
  instanceKey?: ResolveStoredValueKey;
};

export type ShuffleZoneSpec = {
  kind: "shuffle_zone";
  zone: Extract<ResolveZoneSelector, "library">;
  player: ResolvePlayerSelector;
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
  | MoveZoneContentsSpec
  | ExileFromLibraryTopSpec
  | AddSubtypeFromChoiceToTargetSpec
  | CounterTargetSpellSpec
  | SetControlOfTargetSpec
  | UntapTargetSpec
  | AddContinuousEffectToTargetSpec
  | AddTextChangeEffectToTargetSpec
  | ShuffleZoneSpec;

export type ResolveEffectKind = ResolveEffectSpec["kind"];

export type ResolveCondition =
  | {
      kind: "named_card_among";
      nameKey: ResolveStoredValueKey;
      cardsKey: ResolveStoredValueKey;
    }
  | { kind: "mode_equals"; storeKey: ResolveStoredValueKey; modeId: string }
  | { kind: "scratch_present"; key: ResolveStoredValueKey };

/**
 * A card's resolution tree. Leaves are the effect specs above; composite nodes supply the control
 * flow that would otherwise have to be encoded as a card-specific leaf kind. `onResolve` is the
 * child list of an implicit root `sequence`, so a leaf declared at top-level index `i` resolves at
 * path `[i]`.
 */
export type ResolveEffectNode =
  | { kind: "sequence"; children: ResolveEffectNode[] }
  | {
      kind: "for_each_player";
      /** `apnap` starts with the active player; `controller_first` starts with the controller. */
      order: "apnap" | "controller_first";
      body: ResolveEffectNode;
    }
  | {
      kind: "conditional";
      if: ResolveCondition;
      then: ResolveEffectNode;
      else?: ResolveEffectNode;
    }
  | ResolveEffectSpec;
