import type { Command } from "../commands/command";
import type { GameEvent } from "../events/event";
import { Rng } from "../rng/rng";
import type { GameState, PendingChoice } from "../state/gameState";

export type CommandResult = {
  nextState: GameState;
  newEvents: GameEvent[];
  pendingChoice: PendingChoice | null;
};

export type CommandHandlerResult = CommandResult;

type HandlerResult = {
  state: GameState;
  events: GameEvent[];
  pendingChoice?: PendingChoice | null;
};

function passThrough(state: Readonly<GameState>): HandlerResult {
  return {
    state: { ...state },
    events: []
  };
}

export function processCommand(
  state: Readonly<GameState>,
  command: Command,
  rng: Rng
): CommandResult {
  const handlerResult = (() => {
    switch (command.type) {
      case "CAST_SPELL":
      case "ACTIVATE_ABILITY":
      case "PASS_PRIORITY":
      case "MAKE_CHOICE":
      case "DECLARE_ATTACKERS":
      case "DECLARE_BLOCKERS":
      case "PLAY_LAND":
      case "CONCEDE":
        return passThrough(state);
      default: {
        const neverCommand: never = command;
        return neverCommand;
      }
    }
  })();

  const nextSeed = rng.getSeed();
  const baselineSeed = new Rng(state.rngSeed).getSeed();
  const nextState: GameState =
    nextSeed === baselineSeed
      ? handlerResult.state
      : {
          ...handlerResult.state,
          rngSeed: nextSeed
        };

  return {
    nextState,
    newEvents: handlerResult.events,
    pendingChoice: handlerResult.pendingChoice ?? null
  };
}
