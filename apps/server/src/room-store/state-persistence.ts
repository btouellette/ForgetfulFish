import type { Prisma } from "@forgetful-fish/database";
import {
  deserializeGameStateFromPersistence,
  serializeGameStateForPersistence,
  type GameState,
  type SerializedGameState
} from "@forgetful-fish/game-engine";

export function toPersistedGameState(state: GameState): Prisma.InputJsonValue {
  const serialized = serializeGameStateForPersistence(state);
  return JSON.parse(JSON.stringify(serialized));
}

function isSerializedGameState(value: unknown): value is SerializedGameState {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if (!("id" in value) || !("version" in value) || !("engineVersion" in value)) {
    return false;
  }

  return true;
}

export function fromPersistedGameState(serialized: unknown): GameState {
  if (!isSerializedGameState(serialized)) {
    throw new Error("invalid persisted game state");
  }

  return deserializeGameStateFromPersistence(serialized);
}
