// @vitest-environment jsdom

import React, { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { CanvasHost } from "./CanvasHost";

type ResizeObserverCallback = (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  callback: ResizeObserverCallback;
  observed: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  trigger(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

function setElementSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
}

describe("CanvasHost", () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    MockResizeObserver.instances = [];
    vi.unstubAllGlobals();
  });

  it("mounts a canvas, observes its container, and exposes the canvas ref", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const forwardedRef = createRef<HTMLCanvasElement>();
    const onCanvasReady = vi.fn();

    act(() => {
      root.render(<CanvasHost ref={forwardedRef} onCanvasReady={onCanvasReady} />);
    });

    const host = container.firstElementChild as HTMLDivElement;
    const canvas = host.querySelector("canvas");

    expect(canvas).toBeTruthy();
    expect(MockResizeObserver.instances).toHaveLength(1);
    expect(MockResizeObserver.instances[0]?.observed).toContain(host);
    expect(forwardedRef.current).toBe(canvas);
    expect(onCanvasReady).toHaveBeenCalledWith(canvas);
  });

  it("updates canvas pixel size when the host resizes", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(<CanvasHost devicePixelRatio={2} />);
    });

    const host = container.firstElementChild as HTMLDivElement;
    const canvas = host.querySelector("canvas") as HTMLCanvasElement;
    setElementSize(host, 120, 80);

    act(() => {
      MockResizeObserver.instances[0]?.trigger(host);
    });

    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);
    expect(canvas.style.width).toBe("120px");
    expect(canvas.style.height).toBe("80px");
  });

  it("disconnects the resize observer and clears the ready callback on unmount", () => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const onCanvasReady = vi.fn();

    act(() => {
      root.render(<CanvasHost onCanvasReady={onCanvasReady} />);
    });

    const observer = MockResizeObserver.instances[0];

    act(() => {
      root.unmount();
    });

    expect(observer?.disconnected).toBe(true);
    expect(onCanvasReady).toHaveBeenLastCalledWith(null);
  });
});
