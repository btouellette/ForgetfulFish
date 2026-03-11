import React from "react";
import type { PlayerGameView } from "@forgetful-fish/realtime-contract";

import styles from "./ZonesSummaryPanel.module.css";

type ZonesSummaryPanelProps = {
  viewerPlayerId: string;
  zones: PlayerGameView["zones"];
};

const viewerZoneKinds = ["battlefield", "graveyard", "exile"] as const;
const sharedZoneKinds = ["library", "stack"] as const;

function toLabel(kind: string) {
  return kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ");
}

function countZone(
  zones: PlayerGameView["zones"],
  options: { scope: "shared" } | { scope: "player"; playerId: string },
  kind: string
) {
  const match = zones.find((zone) => {
    if (zone.zoneRef.kind !== kind || zone.zoneRef.scope !== options.scope) {
      return false;
    }

    if (zone.zoneRef.scope === "player" && options.scope === "player") {
      return zone.zoneRef.playerId === options.playerId;
    }

    return true;
  });

  return match?.count ?? 0;
}

function ZoneGroup({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
}) {
  return (
    <section className={styles.zoneGroup}>
      <h4>{title}</h4>
      {rows.map((row) => (
        <div key={row.label} className={styles.zoneRow}>
          <span>{row.label}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </section>
  );
}

export function ZonesSummaryPanel({ viewerPlayerId, zones }: ZonesSummaryPanelProps) {
  const opponentZone = zones.find(
    (zone) => zone.zoneRef.scope === "player" && zone.zoneRef.playerId !== viewerPlayerId
  );
  const opponentPlayerId =
    opponentZone?.zoneRef.scope === "player" ? opponentZone.zoneRef.playerId : null;

  const viewerRows = viewerZoneKinds.map((kind) => ({
    label: toLabel(kind),
    count: countZone(zones, { scope: "player", playerId: viewerPlayerId }, kind)
  }));

  const opponentRows = viewerZoneKinds.map((kind) => ({
    label: toLabel(kind),
    count: opponentPlayerId
      ? countZone(zones, { scope: "player", playerId: opponentPlayerId }, kind)
      : 0
  }));

  const sharedRows = sharedZoneKinds.map((kind) => ({
    label: toLabel(kind),
    count: countZone(zones, { scope: "shared" }, kind)
  }));

  return (
    <section className={styles.zonesSummaryPanel}>
      <h3>Zones</h3>
      <ZoneGroup title="Your zones" rows={viewerRows} />
      <ZoneGroup title="Opponent zones" rows={opponentRows} />
      <ZoneGroup title="Shared zones" rows={sharedRows} />
    </section>
  );
}
