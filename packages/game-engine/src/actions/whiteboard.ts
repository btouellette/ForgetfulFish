import type { EffectContext } from "../stack/stackItem";

export function advanceCursor(context: EffectContext): EffectContext {
  switch (context.cursor.kind) {
    case "start":
      return {
        ...context,
        cursor: { kind: "step", index: 0 }
      };
    case "step":
      return {
        ...context,
        cursor: { kind: "step", index: context.cursor.index + 1 }
      };
    case "waiting_choice":
    case "done":
      return context;
  }
}

export function writeToScratch(context: EffectContext, key: string, value: unknown): EffectContext {
  return {
    ...context,
    whiteboard: {
      ...context.whiteboard,
      scratch: {
        ...context.whiteboard.scratch,
        [key]: value
      }
    }
  };
}

export function readFromScratch(context: EffectContext, key: string): unknown {
  return context.whiteboard.scratch[key];
}
