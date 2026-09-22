import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type {
  LoadingPhase,
  ViewerCommand,
  ViewerHandle,
} from "../types/drawing";
import { DrawingViewer } from "../viewer/DrawingViewer";

type Props = {
  file: File;
  drawingMode?: boolean;
  onPoint?(point: { x: number; y: number }): void;
  onProgress(
    phase: LoadingPhase,
    processed: number,
    total: number,
  ): void;
  onReady(): void;
  onError(error: unknown): void;
};

export const DrawingCanvas = forwardRef<ViewerHandle, Props>(
  function DrawingCanvas({ file, drawingMode, onPoint, onProgress, onReady, onError }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewerRef = useRef<DrawingViewer | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        execute(command: ViewerCommand) {
          viewerRef.current?.execute(command);
        },
        pointFromClient(x: number, y: number) {
          return viewerRef.current?.pointFromClient(x, y) ?? null;
        },
      }),
      [],
    );

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      let active = true;
      const viewer = new DrawingViewer(containerRef.current);
      viewerRef.current = viewer;

      viewer
        .load(file, onProgress)
        .then(() => {
          if (active) {
            onReady();
          }
        })
        .catch((error: unknown) => {
          if (active) {
            onError(error);
          }
        });

      return () => {
        active = false;
        viewerRef.current = null;
        viewer.destroy();
      };
    }, [file, onError, onProgress, onReady]);

    return <div ref={containerRef} className="drawing-canvas"
      style={{ cursor: drawingMode ? "crosshair" : undefined }}
      onClick={drawingMode ? (event) => {
        const point = viewerRef.current?.pointFromClient(event.clientX, event.clientY);
        if (point) onPoint?.(point);
      } : undefined} />;
  },
);
