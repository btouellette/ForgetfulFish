import type { ObjectId, PlayerId } from "../state/objectRef";
import type { ZoneKey, ZoneKind, ZoneRef } from "../state/zones";
import type { GameState } from "../state/gameState";

export type OwnershipReason = "draw" | "play";

export type ZoneSetup = {
  zoneCatalog: ZoneRef[];
  zones: Map<ZoneKey, ObjectId[]>;
};

export interface GameMode {
  id: string;
  resolveZone(state: GameState, logicalZone: ZoneKind, playerId?: PlayerId): ZoneRef;
  createInitialZones(players: [PlayerId, PlayerId]): ZoneSetup;
  simultaneousDrawOrder(
    drawCount: number,
    activePlayerId: PlayerId,
    players: [PlayerId, PlayerId]
  ): PlayerId[];
  determineOwner(playerId: PlayerId, reason: OwnershipReason): PlayerId;
}
