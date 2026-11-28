import type { Duration } from "./abilityAst";
import type { ContinuousEffectPayload, Layer } from "../effects/continuous/layers";
import type { Mode } from "../commands/command";

/**
 * Card resolution is described as a small tree of composable specs. Most cards
 * are a flat list of leaf steps; `conditional`, `modal`, and `for_each_player`
 * nest further lists. Steps communicate through the stack item's scratch
 * whiteboard via `storeKey`s, and every leaf's actions are applied before the
 * next step runs, so later steps observe the results of earlier ones.
 */

export type ResolveStoredValueKey = string;
export type ResolveTargetObjectSelector = "first_object_target";

/**
 * `iterated_player` is only valid inside `for_each_player` and
 * `each_player_draws`, where it is bound to the player currently being iterated.
 */
export type ResolvePlayerSelector =
  | "controller"
  | "opponent"
  | "target_player_or_controller"
  | "iterated_player";

/** `all_players` resolves to the union of every player's zone of that kind. */
export type ResolveZoneOwnerSelector = ResolvePlayerSelector | "all_players";
export type ResolveZoneSelector = "hand" | "library" | "graveyard" | "battlefield" | "exile";

export type ResolveCardFilter = {
  /** Keep cards whose type line contains any of these types. */
  types?: string[];
  /** Keep cards whose subtypes include the basic land type stored under `storeKey`. */
  landType?: { kind: "stored"; storeKey: ResolveStoredValueKey };
  /** Keep cards that are the same card (definition) as the resolving card. */
  sameCardAsSource?: true;
  /** Keep cards whose name matches the name stored under `storeKey`. */
  name?: { kind: "stored"; storeKey: ResolveStoredValueKey };
};

/** Selects a set of card object ids at the moment the step runs. */
export type ResolveCardsSelector = (
  | { kind: "stored"; storeKey: ResolveStoredValueKey }
  | { kind: "zone"; zone: ResolveZoneSelector; player: ResolveZoneOwnerSelector }
  | { kind: "top_of_library"; player: ResolvePlayerSelector; count: ResolveAmount }
  | { kind: "target_object" }
) & { filter?: ResolveCardFilter };

/** Numeric expression evaluated when the step runs. Results are clamped at zero. */
export type ResolveAmount =
  | number
  | { kind: "count"; cards: ResolveCardsSelector }
  | { kind: "plus"; terms: ResolveAmount[] }
  | { kind: "minus"; from: ResolveAmount; subtract: ResolveAmount };

export type ResolveCondition =
  | { kind: "cards_not_empty"; cards: ResolveCardsSelector }
  | { kind: "stored_equals"; storeKey: ResolveStoredValueKey; value: string }
  | { kind: "has_target"; target: "object" | "player" }
  | { kind: "not"; condition: ResolveCondition };

// ---------------------------------------------------------------------------
// Control flow
// ---------------------------------------------------------------------------

export type ConditionalSpec = {
  kind: "conditional";
  condition: ResolveCondition;
  then: ResolveEffectSpec[];
  else?: ResolveEffectSpec[];
};

export type ModalBranch = Mode & {
  effects: ResolveEffectSpec[];
};

/** "Choose one —" cards: prompts for a mode, then runs only that branch. */
export type ModalSpec = {
  kind: "modal";
  prompt: string;
  modes: ModalBranch[];
  storeKey?: ResolveStoredValueKey;
};

/** Runs `effects` once per player in APNAP order with `iterated_player` bound. */
export type ForEachPlayerSpec = {
  kind: "for_each_player";
  effects: ResolveEffectSpec[];
};

// ---------------------------------------------------------------------------
// Choices (pause resolution until the player answers)
// ---------------------------------------------------------------------------

export type ChooseCardsSpec = {
  kind: "choose_cards";
  from: ResolveCardsSelector;
  min: number;
  max: number;
  prompt: string;
  storeKey: ResolveStoredValueKey;
};

export type OrderCardsSpec = {
  kind: "order_cards";
  cards: ResolveCardsSelector;
  prompt: string;
  storeKey: ResolveStoredValueKey;
};

export type NameCardSpec = {
  kind: "name_card";
  prompt: string;
  storeKey: ResolveStoredValueKey;
};

/** Chooses a data value (for example a land type) and stores it; see `modal` for branching. */
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

// ---------------------------------------------------------------------------
// Card movement and drawing
// ---------------------------------------------------------------------------

export type DrawCardsSpec = {
  kind: "draw_cards";
  count: ResolveAmount;
  player: ResolvePlayerSelector;
};

/**
 * Each player draws, interleaved through `GameMode.simultaneousDrawOrder` so a
 * shared library is dealt alternately. `count` is evaluated per player with
 * `iterated_player` bound.
 */
export type EachPlayerDrawsSpec = {
  kind: "each_player_draws";
  count: ResolveAmount;
};

/**
 * Moves the selected cards to `to` (each card's owner's zone for hidden/private
 * zones). `placement: "top"` preserves selector order on top of the destination;
 * otherwise cards are appended. `storeKey` records the moved card ids.
 */
export type MoveCardsSpec = {
  kind: "move_cards";
  cards: ResolveCardsSelector;
  to: ResolveZoneSelector;
  placement?: "top" | "bottom";
  storeKey?: ResolveStoredValueKey;
};

export type MillCardsSpec = {
  kind: "mill_cards";
  count: ResolveAmount;
  player: ResolvePlayerSelector;
  storeKey?: ResolveStoredValueKey;
};

export type ShuffleZoneSpec = {
  kind: "shuffle_zone";
  zone: Extract<ResolveZoneSelector, "library">;
  player: ResolvePlayerSelector;
  topCardFromKey?: ResolveStoredValueKey;
};

// ---------------------------------------------------------------------------
// Targets and permanents
// ---------------------------------------------------------------------------

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

export type PhaseOutTargetSpec = {
  kind: "phase_out_target";
  target: ResolveTargetObjectSelector;
};

/**
 * Continuous-effect payloads that depend on values chosen during resolution.
 * `become_basic_land_type` turns the object into a land of the stored type.
 */
export type ResolveContinuousEffectTemplate =
  | ContinuousEffectPayload
  | { kind: "become_basic_land_type"; landTypeKey: ResolveStoredValueKey };

export type AddContinuousEffectSpec = {
  kind: "add_continuous_effect";
  to: ResolveCardsSelector;
  layer: Layer;
  duration: Duration;
  effect: ResolveContinuousEffectTemplate;
};

export type AddTextChangeEffectToTargetSpec = {
  kind: "add_text_change_effect_to_target";
  target: ResolveTargetObjectSelector;
  duration: Duration;
  fromKey: ResolveStoredValueKey;
  toKey: ResolveStoredValueKey;
  instanceKey?: ResolveStoredValueKey;
};

export type ResolveCompositeSpec = ConditionalSpec | ModalSpec | ForEachPlayerSpec;

export type ResolveLeafSpec =
  | ChooseCardsSpec
  | OrderCardsSpec
  | NameCardSpec
  | ChooseModeSpec
  | DrawCardsSpec
  | EachPlayerDrawsSpec
  | MoveCardsSpec
  | MillCardsSpec
  | ShuffleZoneSpec
  | CounterTargetSpellSpec
  | SetControlOfTargetSpec
  | UntapTargetSpec
  | PhaseOutTargetSpec
  | AddContinuousEffectSpec
  | AddTextChangeEffectToTargetSpec;

export type ResolveEffectSpec = ResolveCompositeSpec | ResolveLeafSpec;

export type ResolveEffectKind = ResolveEffectSpec["kind"];

export function isCompositeSpec(spec: ResolveEffectSpec): spec is ResolveCompositeSpec {
  return spec.kind === "conditional" || spec.kind === "modal" || spec.kind === "for_each_player";
}

/** Lists every nested step list of a composite spec (all branches, not just the taken one). */
export function listCompositeBranches(spec: ResolveCompositeSpec): ResolveEffectSpec[][] {
  switch (spec.kind) {
    case "conditional":
      return spec.else === undefined ? [spec.then] : [spec.then, spec.else];
    case "modal":
      return spec.modes.map((mode) => mode.effects);
    case "for_each_player":
      return [spec.effects];
    default: {
      const exhaustive: never = spec;
      return exhaustive;
    }
  }
}
