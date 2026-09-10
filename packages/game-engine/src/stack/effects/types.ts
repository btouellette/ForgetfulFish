import type { CardDefinition } from "../../cards/cardDefinition";
import type { GameAction } from "../../actions/action";
import type { GameEvent, GameEventPayload } from "../../events/event";
import type { Rng } from "../../rng/rng";
import type { GameState } from "../../state/gameState";
import type { OnResolveRegistry } from "../onResolveRegistry";
import type { ResolutionPath, StackItem } from "../stackItem";

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

export type ResolveEffectHandlerContext = {
  state: Readonly<GameState>;
  stackItem: StackItem;
  /** Where the executing effect sits in the card's resolution tree, used to resume after a pause. */
  path: ResolutionPath;
  /** Set while resolving inside a `for_each_player` body; selected by `iteration_player`. */
  iterationPlayerId?: string | undefined;
  /**
   * Namespaces a card-declared scratch key to the executing iteration, so one player's stored
   * values are never visible to the next player's pass over the same effects.
   */
  scratchKey: (key: string) => string;
  /** Scratch as the executing iteration sees it: its own values shadow the shared ones. */
  scratchView: () => Readonly<Record<string, unknown>>;
  cardDefinition: CardDefinition;
  rng: Rng;
  mutable: ResolveMutableState;
  effects: OnResolveRegistry;
  writeScratch: (entries: Record<string, unknown>) => void;
  enqueueAction: (action: GameAction) => void;
  emit: (payload: GameEventPayload) => void;
  pauseWithChoice: (
    choice: NonNullable<GameState["pendingChoice"]>,
    updatedTopItem: StackItem
  ) => PauseResult;
};

export type ResolveEffectResult =
  | { kind: "continue" }
  | {
      kind: "pause";
      result: PauseResult;
    };
