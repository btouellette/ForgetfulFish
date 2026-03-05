import type { Command } from "../commands/command";
import { advanceStepWithEvents, passPriority } from "../engine/kernel";
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

function assertNeverCommand(_command: never): never {
  throw new Error("Unhandled command type in processCommand");
}

function passThrough(state: Readonly<GameState>): HandlerResult {
  return {
    state: { ...state },
    events: []
  };
}

function handlePassPriorityCommand(state: Readonly<GameState>, rng: Rng): HandlerResult {
  const playerWithPriority = state.turnState.priorityState.playerWithPriority;
  const priorityResult = passPriority(state, playerWithPriority);

  if (priorityResult.bothPassed) {
    const stepped = advanceStepWithEvents(priorityResult.state, rng);
    return {
      state: stepped.state,
      events: stepped.events
    };
  }

  return {
    state: priorityResult.state,
    events: []
  };
}

function normalizeRngSeed(seed: string): string {
  return seed.startsWith("u32:") ? seed : new Rng(seed).getSeed();
}

function applyRngSeedIfChanged(
  state: GameState,
  baselineSeed: string,
  nextSeed: string
): GameState {
  return nextSeed === baselineSeed
    ? state
    : {
        ...state,
        rngSeed: nextSeed
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
      case "MAKE_CHOICE":
      case "DECLARE_ATTACKERS":
      case "DECLARE_BLOCKERS":
      case "PLAY_LAND":
      case "CONCEDE":
        return passThrough(state);
      case "PASS_PRIORITY":
        return handlePassPriorityCommand(state, rng);
      default: {
        return assertNeverCommand(command);
      }
    }
  })();

  const baselineSeed = normalizeRngSeed(state.rngSeed);
  const nextState = applyRngSeedIfChanged(handlerResult.state, baselineSeed, rng.getSeed());

  return {
    nextState,
    newEvents: handlerResult.events,
    pendingChoice:
      handlerResult.pendingChoice !== undefined
        ? handlerResult.pendingChoice
        : (nextState.pendingChoice ?? null)
  };
}
