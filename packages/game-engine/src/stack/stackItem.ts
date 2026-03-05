import type { Target } from "../commands/command";
import type { ObjectRef, PlayerId } from "../state/objectRef";

export type StackItemId = string;

export type ResolutionCursor = { kind: "start" };

export type Whiteboard = {
  actions: string[];
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
