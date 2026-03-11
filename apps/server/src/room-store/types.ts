export type RoomSeat = "P1" | "P2";

export type CreatedRoomPayload = {
  roomId: string;
  ownerUserId: string;
  seat: RoomSeat;
};

export type JoinRoomResult =
  | {
      status: "joined";
      roomId: string;
      userId: string;
      seat: RoomSeat;
    }
  | {
      status: "not_found";
    }
  | {
      status: "full";
    };

export type RoomLobbyParticipant = {
  userId: string;
  seat: RoomSeat;
  ready: boolean;
};

export type RoomLobbyPayload = {
  roomId: string;
  participants: RoomLobbyParticipant[];
  gameId: string | null;
  gameStatus: "not_started" | "started";
};

export type GetRoomLobbyResult =
  | { status: "ok"; payload: RoomLobbyPayload }
  | { status: "not_found" }
  | { status: "forbidden" };

export type GetRoomGameStateResult =
  | { status: "ok"; payload: unknown }
  | { status: "not_found" }
  | { status: "forbidden" };

export type SetRoomReadyResult =
  | {
      status: "ok";
      roomId: string;
      userId: string;
      seat: RoomSeat;
      ready: boolean;
    }
  | { status: "not_found" }
  | { status: "forbidden" };

export type StartGameResult =
  | {
      status: "started";
      roomId: string;
      gameId: string;
      gameStatus: "started";
    }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "not_ready" };

export type ApplyGameplayCommandResult =
  | {
      status: "applied";
      roomId: string;
      gameId: string;
      stateVersion: number;
      lastAppliedEventSeq: number;
      pendingChoice: unknown | null;
      emittedEvents: Array<{
        seq: number;
        eventType: string;
      }>;
    }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "conflict" }
  | { status: "invalid_command"; message: string };

export type RoomStore = {
  createRoom: (ownerUserId: string) => Promise<CreatedRoomPayload>;
  joinRoom: (roomId: string, userId: string) => Promise<JoinRoomResult>;
  getLobby: (roomId: string, userId: string) => Promise<GetRoomLobbyResult>;
  getGameState: (roomId: string, userId: string) => Promise<GetRoomGameStateResult>;
  setReady: (roomId: string, userId: string, ready: boolean) => Promise<SetRoomReadyResult>;
  startGame: (roomId: string, userId: string) => Promise<StartGameResult>;
  applyCommand: (
    roomId: string,
    userId: string,
    command: unknown
  ) => Promise<ApplyGameplayCommandResult>;
};
