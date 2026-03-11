import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EventRail } from "./EventRail";

describe("EventRail", () => {
  it("renders recent events in ascending sequence order", () => {
    const html = renderToStaticMarkup(
      <EventRail
        recentEvents={[
          { seq: 7, eventType: "PRIORITY_PASSED" },
          { seq: 8, eventType: "STACK_ITEM_RESOLVED" }
        ]}
      />
    );

    expect(html).toContain("#7");
    expect(html).toContain("PRIORITY_PASSED");
    expect(html).toContain("#8");
    expect(html).toContain("STACK_ITEM_RESOLVED");
    expect(html.indexOf("#7")).toBeLessThan(html.indexOf("#8"));
  });

  it("renders a compact empty state when no events exist", () => {
    const html = renderToStaticMarkup(<EventRail recentEvents={[]} />);

    expect(html).toContain("No events yet");
  });
});
