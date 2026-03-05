import type { Prisma } from "@forgetful-fish/database";
import {
  deserializeGameStateFromPersistence,
  serializeGameStateForPersistence,
  type GameState,
  type SerializedGameState
} from "@forgetful-fish/game-engine";

export function toPersistedGameState(state: GameState): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(serializeGameStateForPersistence(state)));
}

export function fromPersistedGameState(serialized: SerializedGameState): GameState {
  return deserializeGameStateFromPersistence(serialized);
}
