import type { Target } from "../commands/command";
import type { GameAction } from "../actions/action";
import type { ObjectRef, PlayerId } from "../state/objectRef";

export type StackItemId = string;

export type ResolutionCursor =
  | { kind: "start" }
  | { kind: "step"; index: number }
  | { kind: "waiting_choice"; choiceId: string }
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
