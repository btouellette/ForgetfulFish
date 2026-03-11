import React from "react";

import styles from "./EventRail.module.css";

type EventRailProps = {
  recentEvents: Array<{ seq: number; eventType: string }>;
};

export function EventRail({ recentEvents }: EventRailProps) {
  return (
    <section className={styles.eventRail}>
      <h3>Events</h3>
      {recentEvents.length === 0 ? (
        <p className={styles.emptyState}>No events yet.</p>
      ) : (
        <div className={styles.eventList}>
          {recentEvents.map((event) => (
            <div key={`${event.seq}-${event.eventType}`} className={styles.eventRow}>
              <strong>#{event.seq}</strong>
              <span>{event.eventType}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
