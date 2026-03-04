import type { ObjectId, PlayerId } from "../state/objectRef";
import { zoneKey, type ZoneRef } from "../state/zones";
import type { GameMode, OwnershipReason, ZoneSetup } from "./gameMode";

function createZones(zoneCatalog: ZoneRef[]): Map<string, ObjectId[]> {
  return new Map(zoneCatalog.map((zone) => [zoneKey(zone), []]));
}

function getAlternatingPlayer(
  activePlayerId: PlayerId,
  players: [PlayerId, PlayerId],
  index: number
): PlayerId {
  if (index % 2 === 0) {
    return activePlayerId;
  }

  return players[0] === activePlayerId ? players[1] : players[0];
}

export const SharedDeckMode: GameMode = {
  id: "shared-deck",
  resolveZone(_state, logicalZone, playerId) {
    if (logicalZone === "library" || logicalZone === "graveyard") {
      return { kind: logicalZone, scope: "shared" };
    }

    if (logicalZone === "hand") {
      if (playerId === undefined) {
        throw new Error("playerId is required to resolve hand zone");
      }

      return { kind: "hand", scope: "player", playerId };
    }

    return { kind: logicalZone, scope: "shared" };
  },
  createInitialZones(players): ZoneSetup {
    const zoneCatalog: ZoneRef[] = [
      { kind: "library", scope: "shared" },
      { kind: "graveyard", scope: "shared" },
      { kind: "battlefield", scope: "shared" },
      { kind: "exile", scope: "shared" },
      { kind: "stack", scope: "shared" },
      { kind: "hand", scope: "player", playerId: players[0] },
      { kind: "hand", scope: "player", playerId: players[1] }
    ];

    return {
      zoneCatalog,
      zones: createZones(zoneCatalog)
    };
  },
  simultaneousDrawOrder(drawCount, activePlayerId, players): PlayerId[] {
    return Array.from({ length: drawCount }, (_, index) =>
      getAlternatingPlayer(activePlayerId, players, index)
    );
  },
  determineOwner(playerId: PlayerId, _reason: OwnershipReason): PlayerId {
    return playerId;
  }
};
