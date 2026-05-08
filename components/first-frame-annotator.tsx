"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SelectionBox } from "@/lib/types";
import { clamp } from "@/lib/utils";

type Point = {
  x: number;
  y: number;
};

type Rect = Point & {
  width: number;
  height: number;
};

type FirstFrameAnnotatorProps = {
  imageUrl?: string;
  onChange: (selection: SelectionBox | null) => void;
};

function normalizeRect(start: Point, end: Point, maxWidth: number, maxHeight: number): Rect {
  const x1 = clamp(start.x, 0, maxWidth);
  const y1 = clamp(start.y, 0, maxHeight);
  const x2 = clamp(end.x, 0, maxWidth);
  const y2 = clamp(end.y, 0, maxHeight);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

export function FirstFrameAnnotator({ imageUrl, onChange }: FirstFrameAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState<Rect | null>(null);

  const selectionToBox = useCallback(
    (rect: Rect): SelectionBox | null => {
      const image = imageRef.current;
      if (!image || !displaySize.width || !displaySize.height) return null;
      const normalizedX = rect.x / displaySize.width;
      const normalizedY = rect.y / displaySize.height;
      const normalizedWidth = rect.width / displaySize.width;
      const normalizedHeight = rect.height / displaySize.height;
      return {
        x: Math.round(normalizedX * image.naturalWidth),
        y: Math.round(normalizedY * image.naturalHeight),
        width: Math.round(normalizedWidth * image.naturalWidth),
        height: Math.round(normalizedHeight * image.naturalHeight),
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        normalizedX: Number(normalizedX.toFixed(5)),
        normalizedY: Number(normalizedY.toFixed(5)),
        normalizedWidth: Number(normalizedWidth.toFixed(5)),
        normalizedHeight: Number(normalizedHeight.toFixed(5))
      };
    },
    [displaySize.height, displaySize.width]
  );

  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return;
    const width = Math.max(280, container.clientWidth);
    const aspectRatio = image.naturalHeight / image.naturalWidth;
    const height = Math.round(width * aspectRatio);
    setDisplaySize({ width, height });
  }, []);

  useEffect(() => {
    if (!imageUrl) {
      imageRef.current = null;
      setSelection(null);
      setDisplaySize({ width: 0, height: 0 });
      onChange(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setSelection(null);
      onChange(null);
      resizeCanvas();
    };
    image.src = imageUrl;
  }, [imageUrl, onChange, resizeCanvas]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !displaySize.width || !displaySize.height) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(displaySize.width * dpr);
    canvas.height = Math.round(displaySize.height * dpr);
    canvas.style.width = `${displaySize.width}px`;
    canvas.style.height = `${displaySize.height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, displaySize.width, displaySize.height);
    context.drawImage(image, 0, 0, displaySize.width, displaySize.height);

    if (selection) {
      context.save();
      context.fillStyle = "rgba(8, 145, 178, 0.18)";
      context.strokeStyle = "rgb(8, 145, 178)";
      context.lineWidth = 2;
      context.setLineDash([7, 5]);
      context.fillRect(selection.x, selection.y, selection.width, selection.height);
      context.strokeRect(selection.x, selection.y, selection.width, selection.height);
      context.setLineDash([]);
      context.fillStyle = "rgb(8, 145, 178)";
      context.fillRect(selection.x, Math.max(0, selection.y - 24), 108, 24);
      context.fillStyle = "white";
      context.font = "12px sans-serif";
      context.fillText("旧商品区域", selection.x + 10, Math.max(16, selection.y - 8));
      context.restore();
    }
  }, [displaySize.height, displaySize.width, selection]);

  function getPointerPoint(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!imageRef.current || !displaySize.width || !displaySize.height) return;
    const point = getPointerPoint(event);
    dragStartRef.current = point;
    setSelection({ ...point, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragStartRef.current || !displaySize.width || !displaySize.height) return;
    setSelection(normalizeRect(dragStartRef.current, getPointerPoint(event), displaySize.width, displaySize.height));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragStartRef.current || !displaySize.width || !displaySize.height) return;
    const rect = normalizeRect(dragStartRef.current, getPointerPoint(event), displaySize.width, displaySize.height);
    dragStartRef.current = null;
    if (rect.width < 12 || rect.height < 12) {
      setSelection(null);
      onChange(null);
      return;
    }
    setSelection(rect);
    onChange(selectionToBox(rect));
  }

  function resetSelection() {
    setSelection(null);
    onChange(null);
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg border bg-slate-100 canvas-grid">
        {imageUrl ? (
          <canvas
            ref={canvasRef}
            className="block max-w-full cursor-crosshair touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              dragStartRef.current = null;
            }}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
            上传视频后自动显示第一帧
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>{selection ? "已锁定一个替换区域" : "拖拽鼠标或手指框选旧商品"}</span>
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-md" onClick={resetSelection}>
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          重选
        </Button>
      </div>
    </div>
  );
}
