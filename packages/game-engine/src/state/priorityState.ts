import type { PlayerId } from "./objectRef";

export type PriorityState = {
  activePlayerPassed: boolean;
  nonActivePlayerPassed: boolean;
  playerWithPriority: PlayerId;
};

export function createInitialPriorityState(activePlayerId: PlayerId): PriorityState {
  return {
    activePlayerPassed: false,
    nonActivePlayerPassed: false,
    playerWithPriority: activePlayerId
  };
}
