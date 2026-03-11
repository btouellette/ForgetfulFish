import { applyGameplayCommandInDatabase } from "./apply-command";
import { createRoomInDatabase } from "./create-room";
import { getRoomGameStateInDatabase } from "./get-game-state";
import { getRoomLobbyInDatabase } from "./get-lobby";
import { joinRoomInDatabase } from "./join-room";
import { setRoomReadyInDatabase } from "./set-ready";
import { startGameInDatabase } from "./start-game";
import type { RoomStore } from "./types";

export type {
  CreatedRoomPayload,
  GetRoomGameStateResult,
  GetRoomLobbyResult,
  JoinRoomResult,
  RoomLobbyParticipant,
  RoomSeat,
  SetRoomReadyResult,
  StartGameResult,
  RoomStore
} from "./types";

export const databaseRoomStore: RoomStore = {
  createRoom: createRoomInDatabase,
  joinRoom: joinRoomInDatabase,
  getLobby: getRoomLobbyInDatabase,
  getGameState: getRoomGameStateInDatabase,
  setReady: setRoomReadyInDatabase,
  startGame: startGameInDatabase,
  applyCommand: applyGameplayCommandInDatabase
};
