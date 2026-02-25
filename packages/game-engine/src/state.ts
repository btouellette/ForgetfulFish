export type PlayerState = {
  playerId: string;
  life: number;
};

export type GameState = {
  players: [PlayerState, PlayerState];
  activePlayerId: string;
};

export function createInitialGameState(
  playerOneId: string,
  playerTwoId: string
): GameState {
  return {
    players: [
      { playerId: playerOneId, life: 20 },
      { playerId: playerTwoId, life: 20 }
    ],
    activePlayerId: playerOneId
  };
}
