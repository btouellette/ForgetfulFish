import type { GameState } from "../state/gameState";
import type { PlayerId } from "../state/objectRef";
import { createInitialPriorityState } from "../state/priorityState";
import { zoneKey } from "../state/zones";

function assertKnownPlayerId(state: Readonly<GameState>, playerId: PlayerId): void {
  if (state.players[0].id === playerId || state.players[1].id === playerId) {
    return;
  }

  throw new Error(`Unknown playerId '${playerId}'`);
}

function getOtherPlayerId(state: Readonly<GameState>, playerId: PlayerId): PlayerId {
  if (state.players[0].id === playerId) {
    return state.players[1].id;
  }

  if (state.players[1].id === playerId) {
    return state.players[0].id;
  }

  throw new Error(`Unknown playerId '${playerId}' in getOtherPlayerId`);
}

function updatePlayerPriority(
  state: Readonly<GameState>,
  playerId: PlayerId
): GameState["players"] {
  const players: GameState["players"] = [
    {
      ...state.players[0],
      priority: state.players[0].id === playerId
    },
    {
      ...state.players[1],
      priority: state.players[1].id === playerId
    }
  ];

  return players;
}

const TURN_SEQUENCE: GameState["turnState"]["step"][] = [
  "UNTAP",
  "UPKEEP",
  "DRAW",
  "MAIN_1",
  "BEGIN_COMBAT",
  "DECLARE_ATTACKERS",
  "DECLARE_BLOCKERS",
  "COMBAT_DAMAGE",
  "END_COMBAT",
  "MAIN_2",
  "END",
  "CLEANUP"
];

function stepHasPriority(step: GameState["turnState"]["step"]): boolean {
  return step !== "UNTAP" && step !== "CLEANUP";
}

function nextStep(step: GameState["turnState"]["step"]): GameState["turnState"]["step"] {
  const currentIndex = TURN_SEQUENCE.indexOf(step);
  if (currentIndex === -1) {
    throw new Error(`Unknown turn step '${step}'`);
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= TURN_SEQUENCE.length) {
    return "UNTAP";
  }

  const followingStep = TURN_SEQUENCE[nextIndex];
  if (followingStep === undefined) {
    throw new Error(`Missing next step for '${step}'`);
  }

  return followingStep;
}

function isStartingPlayerFirstTurnDraw(state: Readonly<GameState>): boolean {
  return (
    state.turnState.activePlayerId === state.players[0].id &&
    state.players[0].hand.length === 0 &&
    state.players[1].hand.length === 0
  );
}

function drawOne(state: Readonly<GameState>, playerId: PlayerId): GameState {
  const libraryZone = state.mode.resolveZone(state, "library", playerId);
  const handZone = state.mode.resolveZone(state, "hand", playerId);
  const libraryKey = zoneKey(libraryZone);
  const handKey = zoneKey(handZone);

  const library = state.zones.get(libraryKey) ?? [];
  if (library.length === 0) {
    return { ...state };
  }

  const drawnCardId = library[0];
  if (drawnCardId === undefined) {
    return { ...state };
  }

  const remainingLibrary = library.slice(1);
  const nextHand = [...(state.zones.get(handKey) ?? []), drawnCardId];

  const nextZones = new Map(state.zones);
  nextZones.set(libraryKey, remainingLibrary);
  nextZones.set(handKey, nextHand);

  const nextObjectPool = new Map(state.objectPool);
  const drawnObject = nextObjectPool.get(drawnCardId);
  if (drawnObject !== undefined) {
    nextObjectPool.set(drawnCardId, {
      ...drawnObject,
      zone: handZone
    });
  }

  const nextPlayers: GameState["players"] = [
    {
      ...state.players[0],
      hand:
        state.players[0].id === playerId
          ? [...state.players[0].hand, drawnCardId]
          : state.players[0].hand
    },
    {
      ...state.players[1],
      hand:
        state.players[1].id === playerId
          ? [...state.players[1].hand, drawnCardId]
          : state.players[1].hand
    }
  ];

  return {
    ...state,
    players: nextPlayers,
    zones: nextZones,
    objectPool: nextObjectPool
  };
}

function removeUntilEndOfTurnEffects(state: Readonly<GameState>): GameState {
  return {
    ...state,
    continuousEffects: state.continuousEffects.filter(
      (effect) => effect.duration !== "until_end_of_turn"
    )
  };
}

export function givePriority(state: Readonly<GameState>, to: PlayerId): GameState {
  assertKnownPlayerId(state, to);

  const isActivePlayer = to === state.turnState.activePlayerId;

  return {
    ...state,
    players: updatePlayerPriority(state, to),
    turnState: {
      ...state.turnState,
      priorityState: {
        ...state.turnState.priorityState,
        playerWithPriority: to,
        activePlayerPassed: isActivePlayer
          ? false
          : state.turnState.priorityState.activePlayerPassed,
        nonActivePlayerPassed: isActivePlayer
          ? state.turnState.priorityState.nonActivePlayerPassed
          : false
      }
    }
  };
}

export function handlePassPriority(
  state: Readonly<GameState>,
  player: PlayerId
): GameState | "both_passed" {
  assertKnownPlayerId(state, player);

  if (state.turnState.priorityState.playerWithPriority !== player) {
    throw new Error("Cannot pass priority without holding priority");
  }

  const isActivePlayer = player === state.turnState.activePlayerId;
  const updatedState: GameState = {
    ...state,
    turnState: {
      ...state.turnState,
      priorityState: {
        ...state.turnState.priorityState,
        activePlayerPassed: isActivePlayer
          ? true
          : state.turnState.priorityState.activePlayerPassed,
        nonActivePlayerPassed: isActivePlayer
          ? state.turnState.priorityState.nonActivePlayerPassed
          : true
      }
    }
  };

  if (
    updatedState.turnState.priorityState.activePlayerPassed &&
    updatedState.turnState.priorityState.nonActivePlayerPassed
  ) {
    return "both_passed";
  }

  return givePriority(updatedState, getOtherPlayerId(updatedState, player));
}

export function advanceTurn(state: Readonly<GameState>): GameState {
  const nextActivePlayer = getOtherPlayerId(state, state.turnState.activePlayerId);

  return {
    ...state,
    players: updatePlayerPriority(state, nextActivePlayer),
    turnState: {
      activePlayerId: nextActivePlayer,
      phase: "UNTAP",
      step: "UNTAP",
      priorityState: createInitialPriorityState(nextActivePlayer),
      attackers: [],
      blockers: [],
      landPlayedThisTurn: false
    }
  };
}

export function advanceStep(state: Readonly<GameState>): GameState {
  let processedState: GameState = { ...state };

  if (state.turnState.step === "UNTAP") {
    const nextObjectPool = new Map(state.objectPool);
    for (const [objectId, object] of state.objectPool) {
      if (
        object.controller !== state.turnState.activePlayerId ||
        object.zone.kind !== "battlefield"
      ) {
        continue;
      }

      nextObjectPool.set(objectId, {
        ...object,
        tapped: false
      });
    }

    processedState = {
      ...processedState,
      objectPool: nextObjectPool
    };
  }

  if (state.turnState.step === "DRAW" && !isStartingPlayerFirstTurnDraw(state)) {
    processedState = drawOne(processedState, state.turnState.activePlayerId);
  }

  if (state.turnState.step === "CLEANUP") {
    return advanceTurn(removeUntilEndOfTurnEffects(processedState));
  }

  const followingStep = nextStep(state.turnState.step);
  const steppedState: GameState = {
    ...processedState,
    turnState: {
      ...processedState.turnState,
      phase: followingStep,
      step: followingStep
    }
  };

  if (!stepHasPriority(followingStep)) {
    return steppedState;
  }

  return {
    ...steppedState,
    players: updatePlayerPriority(steppedState, steppedState.turnState.activePlayerId),
    turnState: {
      ...steppedState.turnState,
      priorityState: createInitialPriorityState(steppedState.turnState.activePlayerId)
    }
  };
}
