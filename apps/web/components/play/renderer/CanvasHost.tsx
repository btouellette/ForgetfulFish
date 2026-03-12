import React, { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";

import styles from "./CanvasHost.module.css";

type CanvasHostProps = {
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onResize?: (width: number, height: number) => void;
  devicePixelRatio?: number;
};

export const CanvasHost = forwardRef<HTMLCanvasElement | null, CanvasHostProps>(function CanvasHost(
  { onCanvasReady, onResize, devicePixelRatio },
  forwardedRef
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle<HTMLCanvasElement | null, HTMLCanvasElement | null>(
    forwardedRef,
    () => canvasRef.current,
    []
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const dpr = devicePixelRatio ?? window.devicePixelRatio ?? 1;

    const applySize = () => {
      const width = Math.max(0, Math.round(container.clientWidth));
      const height = Math.max(0, Math.round(container.clientHeight));

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      onResize?.(width, height);
    };

    applySize();
    onCanvasReady?.(canvas);

    const observer = new ResizeObserver(() => {
      applySize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      onCanvasReady?.(null);
    };
  }, [devicePixelRatio, onCanvasReady, onResize]);

  return (
    <div ref={containerRef} className={styles.canvasHost}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
});
