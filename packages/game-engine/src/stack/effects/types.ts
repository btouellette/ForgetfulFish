import type { CardDefinition } from "../../cards/cardDefinition";
import type { GameEvent, GameEventPayload } from "../../events/event";
import type { Rng } from "../../rng/rng";
import type { GameState } from "../../state/gameState";
import type { OnResolveRegistry } from "../onResolveRegistry";
import type { StackItem } from "../stackItem";

export type PauseResult = {
  state: GameState;
  events: GameEvent[];
  pendingChoice: GameState["pendingChoice"];
};

export type ResolveMutableState = {
  nextStack: GameState["stack"];
  nextStackZone: string[];
  nextZones: GameState["zones"];
  nextObjectPool: GameState["objectPool"];
  nextLkiStore: GameState["lkiStore"];
  nextPlayers: GameState["players"];
};

export type ResolveEffectHandlerContext = {
  state: Readonly<GameState>;
  stackItem: StackItem;
  cardDefinition: CardDefinition;
  rng: Rng;
  mutable: ResolveMutableState;
  effects: OnResolveRegistry;
  drawOneCard: (playerId: string) => void;
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
