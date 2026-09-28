"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brush, Eraser, RotateCcw, Undo2, Trash2 } from "lucide-react";
import { assetUrl, type Asset } from "./types";
import {
  maskBlob,
  maskStats,
  pointInImage,
  renderMask,
  type Stroke,
} from "./masks";
export type MaskValue = {
  change: Blob;
  keep: Blob | null;
  changePixels: number;
  keepPixels: number;
  strokes: Stroke[];
};
export default function MaskEditor({
  asset,
  onContinue,
  initialStrokes = [],
}: {
  asset: Asset;
  onContinue: (value: MaskValue) => void;
  initialStrokes?: Stroke[];
}) {
  const [mode, setMode] = useState<Stroke["mode"]>("change"),
    [erase, setErase] = useState(false),
    [size, setSize] = useState(50);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes),
    [drawing, setDrawing] = useState<Stroke | null>(null);
  const [stats, setStats] = useState({
    changePixels: 0,
    keepPixels: 0,
    overlap: 0,
  });
  const [error, setError] = useState("");
  const changeRef = useRef<HTMLCanvasElement>(null),
    keepRef = useRef<HTMLCanvasElement>(null),
    surfaceRef = useRef<HTMLCanvasElement>(null);
  const [keyboard, setKeyboard] = useState({ x: 50, y: 50 });
  const redraw = useCallback(() => {
    if (!changeRef.current || !keepRef.current || !surfaceRef.current) return;
    const all = drawing ? [...strokes, drawing] : strokes;
    renderMask(changeRef.current, all, "change", asset.width, asset.height);
    renderMask(keepRef.current, all, "keep", asset.width, asset.height);
    const change = changeRef.current
      .getContext("2d")!
      .getImageData(0, 0, asset.width, asset.height);
    const keep = keepRef.current
      .getContext("2d")!
      .getImageData(0, 0, asset.width, asset.height);
    setStats(maskStats(change.data, keep.data));
    const out = surfaceRef.current;
    out.width = asset.width;
    out.height = asset.height;
    const ctx = out.getContext("2d")!;
    for (let i = 0; i < change.data.length; i += 4) {
      const c = change.data[i + 3] >= 128,
        k = keep.data[i + 3] >= 128;
      change.data[i] = c ? 216 : 49;
      change.data[i + 1] = c ? 101 : 93;
      change.data[i + 2] = c ? 60 : 154;
      change.data[i + 3] = c || k ? 125 : 0;
      if (c && k) {
        change.data[i] = 180;
        change.data[i + 1] = 25;
        change.data[i + 2] = 35;
        change.data[i + 3] = 210;
      }
    }
    ctx.putImageData(change, 0, 0);
  }, [asset, strokes, drawing]);
  useEffect(() => {
    redraw();
  }, [redraw]);
  async function proceed() {
    setError("");
    if (!stats.changePixels) {
      setError("Paint an area to CHANGE first.");
      return;
    }
    if (stats.overlap) {
      setError("CHANGE and KEEP overlap. Erase the overlap before continuing.");
      return;
    }
    if (stats.changePixels === asset.width * asset.height) {
      setError("Leave an area outside CHANGE for comparison.");
      return;
    }
    try {
      onContinue({
        change: await maskBlob(changeRef.current!),
        keep: stats.keepPixels ? await maskBlob(keepRef.current!) : null,
        ...stats,
        strokes,
      });
    } catch {
      setError("Could not prepare masks. Please try again.");
    }
  }
  return (
    <div className="mask-editor">
      <div className="toolbar">
        <div className="mode-buttons">
          <button
            type="button"
            aria-pressed={mode === "change"}
            className={mode === "change" ? "mode change active" : "mode change"}
            onClick={() => setMode("change")}
          >
            01 / CHANGE
          </button>
          <button
            type="button"
            aria-pressed={mode === "keep"}
            className={mode === "keep" ? "mode keep active" : "mode keep"}
            onClick={() => setMode("keep")}
          >
            02 / KEEP
          </button>
        </div>
        <div className="tool-buttons">
          <button
            type="button"
            aria-label="Brush"
            aria-pressed={!erase}
            onClick={() => setErase(false)}
          >
            <Brush size={18} />
          </button>
          <button
            type="button"
            aria-label="Erase"
            aria-pressed={erase}
            onClick={() => setErase(true)}
          >
            <Eraser size={18} />
          </button>
          <button
            type="button"
            aria-label="Undo last stroke"
            disabled={!strokes.length}
            onClick={() => setStrokes((s) => s.slice(0, -1))}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            aria-label="Clear current mask"
            onClick={() =>
              setStrokes((s) => s.filter((stroke) => stroke.mode !== mode))
            }
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            aria-label="Reset both masks"
            onClick={() => setStrokes([])}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
      <div className="brush-row">
        <label htmlFor="brush-size">
          Brush size <strong>{size}px</strong>
        </label>
        <input
          id="brush-size"
          type="range"
          min="5"
          max="180"
          value={size}
          onChange={(e) => setSize(+e.target.value)}
        />
        <span>
          {mode === "change"
            ? "Paint what may change."
            : "Paint what must stay."}
        </span>
      </div>
      <div className="editor-mat">
        <div
          className="paint-frame"
          style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
        >
          <img
            src={assetUrl(asset.id)}
            alt="Your original image for defining CHANGE and KEEP"
            draggable={false}
          />
          <canvas
            ref={surfaceRef}
            data-testid="mask-surface"
            aria-label="Mask painting surface. Use coordinate controls below for keyboard painting."
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const p = pointInImage(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
                asset.width,
                asset.height,
              );
              setDrawing({ mode, erase, size, points: [p] });
            }}
            onPointerMove={(e) => {
              if (!drawing) return;
              const p = pointInImage(
                e.clientX,
                e.clientY,
                e.currentTarget.getBoundingClientRect(),
                asset.width,
                asset.height,
              );
              setDrawing((d) =>
                d ? { ...d, points: [...d.points, p] } : null,
              );
            }}
            onPointerUp={() => {
              if (drawing) setStrokes((s) => [...s, drawing]);
              setDrawing(null);
            }}
            onPointerCancel={() => setDrawing(null)}
          />
        </div>
      </div>
      <canvas ref={changeRef} hidden />
      <canvas ref={keepRef} hidden />
      <div className="mask-legend">
        <span className="change-dot">
          CHANGE · {stats.changePixels.toLocaleString()} px
        </span>
        <span className="keep-dot">
          KEEP · {stats.keepPixels.toLocaleString()} px
        </span>
        <span>
          {asset.width} × {asset.height}
        </span>
      </div>
      <details className="keyboard-paint">
        <summary>Keyboard painting</summary>
        <p>
          Set a position as a percentage of the image. Add a brush dab using the
          current mode and size. Undo and erase work the same way as pointer
          painting.
        </p>
        <div className="coordinate-controls">
          <label>
            X %
            <input
              type="number"
              min="0"
              max="100"
              value={keyboard.x}
              onChange={(e) =>
                setKeyboard((k) => ({
                  ...k,
                  x: Math.max(0, Math.min(100, +e.target.value)),
                }))
              }
            />
          </label>
          <label>
            Y %
            <input
              type="number"
              min="0"
              max="100"
              value={keyboard.y}
              onChange={(e) =>
                setKeyboard((k) => ({
                  ...k,
                  y: Math.max(0, Math.min(100, +e.target.value)),
                }))
              }
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setStrokes((s) => [
                ...s,
                {
                  mode,
                  erase,
                  size,
                  points: [
                    {
                      x: (keyboard.x / 100) * asset.width,
                      y: (keyboard.y / 100) * asset.height,
                    },
                  ],
                },
              ])
            }
          >
            Add brush dab
          </button>
        </div>
      </details>
      {(error || stats.overlap > 0) && (
        <p className="error" role="alert">
          {error || "CHANGE and KEEP overlap. Erase the overlap."}
        </p>
      )}
      <button type="button" className="button primary wide" onClick={proceed}>
        Review edit contract <span aria-hidden>→</span>
      </button>
    </div>
  );
}
