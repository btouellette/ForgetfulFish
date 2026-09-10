import type { EffectContext } from "../stack/stackItem";

function assertNeverCursor(value: never): never {
  throw new Error(`unhandled resolution cursor: ${String(value)}`);
}
export function advanceCursor(context: EffectContext): EffectContext {
  switch (context.cursor.kind) {
    case "start":
      return {
        ...context,
        cursor: { kind: "node", path: [0], phase: "effects" }
      };
    case "node": {
      const path = [...context.cursor.path];
      path[path.length - 1] = (path[path.length - 1] ?? -1) + 1;
      return {
        ...context,
        cursor: { kind: "node", path, phase: context.cursor.phase }
      };
    }
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
