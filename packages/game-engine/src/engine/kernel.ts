import type { GameState } from "../state/gameState";
import type { PlayerId } from "../state/objectRef";

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
