import type { Command, PlayLandCommand } from "../commands/command";
import { validateCastSpell, validatePlayLand } from "../commands/validate";
import { advanceStepWithEvents, passPriority } from "../engine/kernel";
import { createEvent } from "../events/event";
import type { GameEvent } from "../events/event";
import { Rng } from "../rng/rng";
import type { GameState, PendingChoice } from "../state/gameState";
import { createInitialPriorityState } from "../state/priorityState";
import { bumpZcc, zoneKey } from "../state/zones";
import { resolveTopOfStack } from "../stack/resolve";
import type { StackItem } from "../stack/stackItem";

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
    if (priorityResult.state.stack.length > 0) {
      const resolved = resolveTopOfStack(priorityResult.state);
      const activePlayerId = resolved.state.turnState.activePlayerId;
      return {
        state: {
          ...resolved.state,
          players: [
            {
              ...resolved.state.players[0],
              priority: resolved.state.players[0].id === activePlayerId
            },
            {
              ...resolved.state.players[1],
              priority: resolved.state.players[1].id === activePlayerId
            }
          ],
          turnState: {
            ...resolved.state.turnState,
            priorityState: createInitialPriorityState(activePlayerId)
          }
        },
        events: resolved.events
      };
    }

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

function deductManaPool(
  state: Readonly<GameState>,
  playerId: string,
  cost: {
    white?: number;
    blue?: number;
    black?: number;
    red?: number;
    green?: number;
    colorless?: number;
  }
): GameState["players"] {
  const required = {
    white: cost.white ?? 0,
    blue: cost.blue ?? 0,
    black: cost.black ?? 0,
    red: cost.red ?? 0,
    green: cost.green ?? 0,
    colorless: cost.colorless ?? 0
  };

  return [
    {
      ...state.players[0],
      manaPool:
        state.players[0].id === playerId
          ? {
              white: state.players[0].manaPool.white - required.white,
              blue: state.players[0].manaPool.blue - required.blue,
              black: state.players[0].manaPool.black - required.black,
              red: state.players[0].manaPool.red - required.red,
              green: state.players[0].manaPool.green - required.green,
              colorless: state.players[0].manaPool.colorless - required.colorless
            }
          : state.players[0].manaPool
    },
    {
      ...state.players[1],
      manaPool:
        state.players[1].id === playerId
          ? {
              white: state.players[1].manaPool.white - required.white,
              blue: state.players[1].manaPool.blue - required.blue,
              black: state.players[1].manaPool.black - required.black,
              red: state.players[1].manaPool.red - required.red,
              green: state.players[1].manaPool.green - required.green,
              colorless: state.players[1].manaPool.colorless - required.colorless
            }
          : state.players[1].manaPool
    }
  ];
}

function handleCastSpellCommand(state: Readonly<GameState>, command: Command): HandlerResult {
  if (command.type !== "CAST_SPELL") {
    throw new Error("invalid cast spell command");
  }

  const { playerId, cardDefinition } = validateCastSpell(state, command);
  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const stackZone = state.mode.resolveZone(state, "stack", playerId);
  const handKey = zoneKey(handZone);
  const stackKey = zoneKey(stackZone);

  const object = state.objectPool.get(command.cardId);
  if (object === undefined) {
    throw new Error(`Cannot cast missing object '${command.cardId}'`);
  }

  const hand = state.zones.get(handKey) ?? [];
  if (!hand.includes(command.cardId)) {
    throw new Error("card must be in the hand of the player with priority");
  }

  const nextHand = hand.filter((id) => id !== command.cardId);
  const nextStackZone = [...(state.zones.get(stackKey) ?? []), command.cardId];

  const movedObject = bumpZcc({
    ...object,
    zone: stackZone,
    controller: playerId
  });

  const nextObjectPool = new Map(state.objectPool);
  nextObjectPool.set(command.cardId, movedObject);

  const nextZones = new Map(state.zones);
  nextZones.set(handKey, nextHand);
  nextZones.set(stackKey, nextStackZone);

  const paidPlayers = deductManaPool(state, playerId, cardDefinition.manaCost);

  const stackItem: StackItem = {
    id: `${state.id}:stack:${command.cardId}:${state.version + 1}`,
    object: { id: movedObject.id, zcc: movedObject.zcc },
    controller: playerId,
    targets: command.targets ?? [],
    effectContext: {
      stackItemId: `${state.id}:stack:${command.cardId}:${state.version + 1}`,
      source: { id: movedObject.id, zcc: movedObject.zcc },
      controller: playerId,
      targets: command.targets ?? [],
      cursor: { kind: "start" },
      whiteboard: {
        actions: [],
        scratch: {}
      }
    }
  };

  const castState: GameState = {
    ...state,
    version: state.version + 1,
    players: [
      {
        ...paidPlayers[0],
        hand:
          paidPlayers[0].id === playerId
            ? paidPlayers[0].hand.filter((id) => id !== command.cardId)
            : paidPlayers[0].hand,
        priority: paidPlayers[0].id === playerId
      },
      {
        ...paidPlayers[1],
        hand:
          paidPlayers[1].id === playerId
            ? paidPlayers[1].hand.filter((id) => id !== command.cardId)
            : paidPlayers[1].hand,
        priority: paidPlayers[1].id === playerId
      }
    ],
    zones: nextZones,
    objectPool: nextObjectPool,
    stack: [...state.stack, stackItem],
    turnState: {
      ...state.turnState,
      priorityState: createInitialPriorityState(playerId)
    }
  };

  const spellCastEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    castState.version,
    {
      type: "SPELL_CAST",
      object: { id: movedObject.id, zcc: movedObject.zcc },
      controller: playerId
    }
  );

  return {
    state: castState,
    events: [spellCastEvent]
  };
}

function handlePlayLandCommand(
  state: Readonly<GameState>,
  command: PlayLandCommand
): HandlerResult {
  const playerId = state.turnState.priorityState.playerWithPriority;
  validatePlayLand(state, command);

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
        return handleCastSpellCommand(state, command);
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
