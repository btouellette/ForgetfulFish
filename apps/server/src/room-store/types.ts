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

export type RoomStore = {
  createRoom: (ownerUserId: string) => Promise<CreatedRoomPayload>;
  joinRoom: (roomId: string, userId: string) => Promise<JoinRoomResult>;
  getLobby: (roomId: string, userId: string) => Promise<GetRoomLobbyResult>;
  setReady: (roomId: string, userId: string, ready: boolean) => Promise<SetRoomReadyResult>;
  startGame: (roomId: string, userId: string) => Promise<StartGameResult>;
};
