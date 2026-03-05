import type { EffectContext } from "../stack/stackItem";

function assertNeverCursor(value: never): never {
  throw new Error(`unhandled resolution cursor: ${String(value)}`);
}

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
      return {
        ...context
      };
    default:
      return assertNeverCursor(context.cursor);
  }
}

export function writeToScratch<T>(context: EffectContext, key: string, value: T): EffectContext {
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

export function readFromScratch<T>(context: EffectContext, key: string): T | undefined {
  return context.whiteboard.scratch[key] as T | undefined;
}
