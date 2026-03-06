import type { Command, MakeChoiceCommand, PlayLandCommand } from "../commands/command";
import { validateActivateAbility, validateCastSpell, validatePlayLand } from "../commands/validate";
import { resumeChoiceResolution } from "../choices/resume";
import { advanceStepWithEvents, passPriority, tapForMana } from "../engine/kernel";
import { createEvent } from "../events/event";
import type { GameEvent } from "../events/event";
import { Rng } from "../rng/rng";
import type { GameState, PendingChoice } from "../state/gameState";
import { createInitialPriorityState } from "../state/priorityState";
import { bumpZcc, zoneKey } from "../state/zones";
import { runSBALoop } from "./sba";
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
  const passedState: GameState = {
    ...priorityResult.state,
    version: state.version + 1
  };
  const priorityPassedEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    passedState.version,
    {
      type: "PRIORITY_PASSED",
      playerId: playerWithPriority
    }
  );

  if (priorityResult.bothPassed) {
    if (passedState.stack.length > 0) {
      const resolved = resolveTopOfStack(passedState, rng);
      const priorityPlayerId =
        resolved.pendingChoice?.forPlayer ?? resolved.state.turnState.activePlayerId;
      return {
        state: {
          ...resolved.state,
          players: [
            {
              ...resolved.state.players[0],
              priority: resolved.state.players[0].id === priorityPlayerId
            },
            {
              ...resolved.state.players[1],
              priority: resolved.state.players[1].id === priorityPlayerId
            }
          ],
          turnState: {
            ...resolved.state.turnState,
            priorityState: createInitialPriorityState(priorityPlayerId)
          }
        },
        events: [priorityPassedEvent, ...resolved.events],
        pendingChoice: resolved.pendingChoice
      };
    }

    const stepped = advanceStepWithEvents(passedState, rng);
    return {
      state: stepped.state,
      events: [priorityPassedEvent, ...stepped.events]
    };
  }

  return {
    state: passedState,
    events: [priorityPassedEvent]
  };
}

function handleMakeChoiceCommand(
  state: Readonly<GameState>,
  command: MakeChoiceCommand,
  rng: Rng
): HandlerResult {
  if (state.pendingChoice === null) {
    throw new Error("no pending choice to resolve");
  }

  const resumed = resumeChoiceResolution(state, command);
  const choiceEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    resumed.state.version,
    {
      type: "CHOICE_MADE",
      choiceId: state.pendingChoice.id,
      playerId: state.pendingChoice.forPlayer,
      selection: command.payload
    }
  );

  let nextState = resumed.state;
  const events: GameEvent[] = [choiceEvent];
  let pendingChoice: PendingChoice | null = resumed.pendingChoice;

  const resumedTopItem = nextState.stack[nextState.stack.length - 1];
  if (
    pendingChoice === null &&
    resumedTopItem !== undefined &&
    (resumedTopItem.effectContext.cursor.kind === "start" ||
      resumedTopItem.effectContext.cursor.kind === "step")
  ) {
    const resolved = resolveTopOfStack(nextState, rng);
    nextState = resolved.state;
    pendingChoice = resolved.pendingChoice;
    events.push(...resolved.events);
  }

  const priorityPlayerId = pendingChoice?.forPlayer ?? nextState.turnState.activePlayerId;
  const stateWithPriority: GameState = {
    ...nextState,
    players: [
      {
        ...nextState.players[0],
        priority: nextState.players[0].id === priorityPlayerId
      },
      {
        ...nextState.players[1],
        priority: nextState.players[1].id === priorityPlayerId
      }
    ],
    turnState: {
      ...nextState.turnState,
      priorityState: createInitialPriorityState(priorityPlayerId)
    }
  };

  return {
    state: stateWithPriority,
    events,
    pendingChoice
  };
}

function handleDeclareAttackersCommand(
  state: Readonly<GameState>,
  command: Command
): HandlerResult {
  if (command.type !== "DECLARE_ATTACKERS") {
    throw new Error("invalid declare attackers command");
  }

  return {
    state: {
      ...state,
      version: state.version + 1,
      turnState: {
        ...state.turnState,
        attackers: command.attackers
      }
    },
    events: []
  };
}

function handleDeclareBlockersCommand(state: Readonly<GameState>, command: Command): HandlerResult {
  if (command.type !== "DECLARE_BLOCKERS") {
    throw new Error("invalid declare blockers command");
  }

  return {
    state: {
      ...state,
      version: state.version + 1,
      turnState: {
        ...state.turnState,
        blockers: command.assignments.flatMap((assignment) =>
          assignment.blockerIds.map((blockerId) => ({
            attackerId: assignment.attackerId,
            blockerId
          }))
        )
      }
    },
    events: []
  };
}

function handleActivateAbilityCommand(state: Readonly<GameState>, command: Command): HandlerResult {
  if (command.type !== "ACTIVATE_ABILITY") {
    throw new Error("invalid activate ability command");
  }

  const { playerId } = validateActivateAbility(state, command);
  const activated = tapForMana(state, command.sourceId, command.abilityIndex);
  const stateWithPriorityReset: GameState = {
    ...activated.state,
    players: [
      {
        ...activated.state.players[0],
        priority: activated.state.players[0].id === playerId
      },
      {
        ...activated.state.players[1],
        priority: activated.state.players[1].id === playerId
      }
    ],
    turnState: {
      ...activated.state.turnState,
      priorityState: createInitialPriorityState(playerId)
    }
  };

  const source = stateWithPriorityReset.objectPool.get(command.sourceId);
  if (source === undefined) {
    throw new Error(`Cannot activate ability from missing source '${command.sourceId}'`);
  }

  const activatedEvent = createEvent(
    {
      engineVersion: state.engineVersion,
      schemaVersion: 1,
      gameId: state.id
    },
    stateWithPriorityReset.version,
    {
      type: "ABILITY_ACTIVATED",
      source: { id: source.id, zcc: source.zcc },
      controller: playerId
    }
  );

  return {
    state: stateWithPriorityReset,
    events: [activatedEvent, ...activated.events]
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
    generic?: number;
  }
): GameState["players"] {
  const required = {
    white: cost.white ?? 0,
    blue: cost.blue ?? 0,
    black: cost.black ?? 0,
    red: cost.red ?? 0,
    green: cost.green ?? 0,
    colorless: cost.colorless ?? 0,
    generic: cost.generic ?? 0
  };

  function spendGenericMana(
    manaPool: GameState["players"][number]["manaPool"],
    generic: number
  ): GameState["players"][number]["manaPool"] {
    let remaining = generic;
    const nextPool = { ...manaPool };
    const order: Array<keyof typeof nextPool> = [
      "colorless",
      "white",
      "blue",
      "black",
      "red",
      "green"
    ];

    for (const key of order) {
      if (remaining === 0) {
        break;
      }

      const spend = Math.min(nextPool[key], remaining);
      nextPool[key] -= spend;
      remaining -= spend;
    }

    if (remaining > 0) {
      throw new Error("insufficient mana to cast spell");
    }

    return nextPool;
  }

  function deductForPlayer(
    player: GameState["players"][number]
  ): GameState["players"][number]["manaPool"] {
    const poolAfterSpecific = {
      white: player.manaPool.white - required.white,
      blue: player.manaPool.blue - required.blue,
      black: player.manaPool.black - required.black,
      red: player.manaPool.red - required.red,
      green: player.manaPool.green - required.green,
      colorless: player.manaPool.colorless - required.colorless
    };

    return spendGenericMana(poolAfterSpecific, required.generic);
  }

  return [
    {
      ...state.players[0],
      manaPool:
        state.players[0].id === playerId
          ? deductForPlayer(state.players[0])
          : state.players[0].manaPool
    },
    {
      ...state.players[1],
      manaPool:
        state.players[1].id === playerId
          ? deductForPlayer(state.players[1])
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
  if (
    state.pendingChoice !== null &&
    command.type !== "MAKE_CHOICE" &&
    command.type !== "CONCEDE"
  ) {
    throw new Error("only MAKE_CHOICE or CONCEDE are allowed while a pending choice exists");
  }

  const handlerResult = (() => {
    switch (command.type) {
      case "CAST_SPELL":
        return handleCastSpellCommand(state, command);
      case "ACTIVATE_ABILITY":
        return handleActivateAbilityCommand(state, command);
      case "CONCEDE":
        return passThrough(state);
      case "MAKE_CHOICE":
        return handleMakeChoiceCommand(state, command, rng);
      case "DECLARE_ATTACKERS":
        return handleDeclareAttackersCommand(state, command);
      case "DECLARE_BLOCKERS":
        return handleDeclareBlockersCommand(state, command);
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
  const seededState = applyRngSeedIfChanged(handlerResult.state, baselineSeed, rng.getSeed());
  const sbaResult = runSBALoop(seededState);
  const nextState = sbaResult.state;

  return {
    nextState,
    newEvents: [...handlerResult.events, ...sbaResult.events],
    pendingChoice:
      handlerResult.pendingChoice !== undefined
        ? handlerResult.pendingChoice
        : (nextState.pendingChoice ?? null)
  };
}
