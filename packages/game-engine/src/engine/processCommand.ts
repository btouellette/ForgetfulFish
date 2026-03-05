import type { Command, PlayLandCommand } from "../commands/command";
import { validatePlayLand } from "../commands/validate";
import { advanceStepWithEvents, passPriority } from "../engine/kernel";
import { createEvent } from "../events/event";
import type { GameEvent } from "../events/event";
import { Rng } from "../rng/rng";
import type { GameState, PendingChoice } from "../state/gameState";
import { bumpZcc, zoneKey } from "../state/zones";

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

function handlePlayLandCommand(
  state: Readonly<GameState>,
  command: PlayLandCommand
): HandlerResult {
  const playerId = state.turnState.priorityState.playerWithPriority;
  validatePlayLand(state, command, playerId);

  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const battlefieldZone = state.mode.resolveZone(state, "battlefield", playerId);
  const handKey = zoneKey(handZone);
  const battlefieldKey = zoneKey(battlefieldZone);

  const hand = state.zones.get(handKey) ?? [];
  const battlefield = state.zones.get(battlefieldKey) ?? [];
  const handIndex = hand.indexOf(command.cardId);
  if (handIndex === -1) {
    throw new Error("card must be in the hand of the player with priority");
  }

  const nextHand = hand.filter((cardId) => cardId !== command.cardId);
  const nextBattlefield = [...battlefield, command.cardId];

  const object = state.objectPool.get(command.cardId);
  if (object === undefined) {
    throw new Error(`Cannot play missing object '${command.cardId}'`);
  }

  const movedObject = bumpZcc({
    ...object,
    zone: battlefieldZone,
    controller: playerId
  });

  const nextObjectPool = new Map(state.objectPool);
  nextObjectPool.set(command.cardId, movedObject);

  const nextZones = new Map(state.zones);
  nextZones.set(handKey, nextHand);
  nextZones.set(battlefieldKey, nextBattlefield);

  const nextPlayers: GameState["players"] = [
    {
      ...state.players[0],
      hand:
        state.players[0].id === playerId
          ? state.players[0].hand.filter((cardId) => cardId !== command.cardId)
          : state.players[0].hand
    },
    {
      ...state.players[1],
      hand:
        state.players[1].id === playerId
          ? state.players[1].hand.filter((cardId) => cardId !== command.cardId)
          : state.players[1].hand
    }
  ];

  const nextState: GameState = {
    ...state,
    version: state.version + 1,
    players: nextPlayers,
    zones: nextZones,
    objectPool: nextObjectPool,
    turnState: {
      ...state.turnState,
      landPlayedThisTurn: true
    }
  };

  const zoneChangeEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    nextState.version,
    {
      type: "ZONE_CHANGE",
      objectId: command.cardId,
      oldZcc: object.zcc,
      newZcc: movedObject.zcc,
      from: handZone,
      to: battlefieldZone,
      toIndex: nextBattlefield.length - 1
    }
  );

  return {
    state: nextState,
    events: [zoneChangeEvent]
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
      case "CONCEDE":
        return passThrough(state);
      case "PASS_PRIORITY":
        return handlePassPriorityCommand(state, rng);
      case "PLAY_LAND":
        return handlePlayLandCommand(state, command);
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
