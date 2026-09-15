import type { CardDefinition } from "../../cards/cardDefinition";
import type { GameAction } from "../../actions/action";
import type { GameEvent, GameEventPayload } from "../../events/event";
import type { Rng } from "../../rng/rng";
import type { GameState } from "../../state/gameState";
import type { PlayerId } from "../../state/objectRef";
import type { StackItem } from "../stackItem";

export type PauseResult = {
  state: GameState;
  events: GameEvent[];
  pendingChoice: GameState["pendingChoice"];
};

export type ResolveMutableState = {
  nextStack: GameState["stack"];
  nextStackZone: string[];
  nextActions: GameAction[];
  nextZones: GameState["zones"];
  nextObjectPool: GameState["objectPool"];
  nextContinuousEffects: GameState["continuousEffects"];
  nextLkiStore: GameState["lkiStore"];
  nextPlayers: GameState["players"];
};

/** Position of a step inside the (possibly nested) `onResolve` tree. */
export type ResolveStepPath = readonly number[];

export function stepPathKey(path: ResolveStepPath): string {
  return path.join(".");
}

/** Values bound by enclosing composite steps (for example `for_each_player`). */
export type ResolveBindings = {
  iteratedPlayer?: PlayerId;
};

export type ResolveEffectHandlerContext = {
  state: Readonly<GameState>;
  stackItem: StackItem;
  cardDefinition: CardDefinition;
  rng: Rng;
  mutable: ResolveMutableState;
  path: ResolveStepPath;
  bindings: ResolveBindings;
  writeScratch: (entries: Record<string, unknown>) => void;
  enqueueAction: (action: GameAction) => void;
  emit: (payload: GameEventPayload) => void;
  pauseWithChoice: (
    choice: NonNullable<GameState["pendingChoice"]>,
    updatedTopItem: StackItem
  ) => PauseResult;
};

/** Shared context supplied by `resolveTopOfStack`; the interpreter adds per-step `path`/`bindings`. */
export type ResolveRunContext = Omit<
  ResolveEffectHandlerContext,
  "path" | "bindings" | "stackItem"
> & {
  /** The top stack item including scratch written by earlier steps. */
  currentStackItem: () => StackItem;
  /**
   * Applies enqueued actions to the mutable state so subsequent steps observe
   * them. Returns a pause when a replacement choice interrupts the pipeline.
   */
  flushActions: (path: ResolveStepPath) => PauseResult | null;
};

export type ResolveEffectResult =
  | { kind: "continue" }
  | {
      kind: "pause";
      result: PauseResult;
    };
