import type { Target } from "../commands/command";
import type { GameAction } from "../actions/action";
import type { ObjectRef, PlayerId } from "../state/objectRef";

export type StackItemId = string;

/**
 * Position within a card's `onResolve` tree. Each entry indexes one level of composition, so a flat
 * spec list resolves at `[i]` and a spec nested inside a composite node at `[i, j, ...]`.
 */
export type ResolutionPath = number[];

/** Which half of resolution the cursor sits in: the card's effects, or its action pipeline. */
export type ResolutionPhase = "effects" | "pipeline";

export type ResolutionCursor =
  | { kind: "start" }
  | { kind: "node"; path: ResolutionPath; phase: ResolutionPhase }
  | {
      kind: "waiting_choice";
      choiceId: string;
      resumePath: ResolutionPath;
      phase: ResolutionPhase;
    }
  | { kind: "done" };

export type Whiteboard = {
  actions: GameAction[];
  scratch: Record<string, unknown>;
};

export type EffectContext = {
  stackItemId: StackItemId;
  source: ObjectRef;
  controller: PlayerId;
  targets: ResolvedTarget[];
  cursor: ResolutionCursor;
  whiteboard: Whiteboard;
};

export type ResolvedTarget = Target;

export type StackItem = {
  id: StackItemId;
  object: ObjectRef;
  controller: PlayerId;
  targets: ResolvedTarget[];
  effectContext: EffectContext;
};
