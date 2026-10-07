"use client";
import { localText } from "@/frontend/i18n/format";
import { useLocale } from "@/frontend/i18n/LocaleProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  seedMasks?: SeedMasks;
};
export type SeedMasks = Partial<Record<Stroke["mode"], string>>;
export default function MaskEditor({
  asset,
  onContinue,
  initialStrokes = [],
  initialMasks = {},
}: {
  asset: Asset;
  onContinue: (value: MaskValue) => void;
  initialStrokes?: Stroke[];
  initialMasks?: SeedMasks;
}) {
  const { t } = useLocale();

  const [seedMasks, setSeedMasks] = useState<SeedMasks>(initialMasks);
  const [seedImages, setSeedImages] = useState<
    Partial<Record<Stroke["mode"], HTMLImageElement>>
  >({});
  const [loadingSeeds, setLoadingSeeds] = useState(
    Object.keys(initialMasks).length > 0,
  );
  useEffect(() => {
    let live = true;
    const modes = ["change", "keep"] as const;
    Promise.all(
      modes.map(async (mode) => {
        const url = seedMasks[mode];
        if (!url) return [mode, undefined] as const;
        const image = new Image();
        image.src = url;
        await image.decode();
        if (
          image.naturalWidth !== asset.width ||
          image.naturalHeight !== asset.height
        ) {
          throw new Error("Demo mask dimensions do not match the image.");
        }
        return [mode, image] as const;
      }),
    )
      .then((entries) => {
        if (live) {
          setSeedImages(Object.fromEntries(entries));
          setLoadingSeeds(false);
        }
      })
      .catch(() => {
        if (live) {
          setError(
            "Could not load demo masks. Reset both masks to paint your own.",
          );
          setLoadingSeeds(true);
        }
      });
    return () => {
      live = false;
    };
  }, [seedMasks, asset.width, asset.height]);
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
    renderMask(
      changeRef.current,
      all,
      "change",
      asset.width,
      asset.height,
      seedImages.change,
    );
    renderMask(
      keepRef.current,
      all,
      "keep",
      asset.width,
      asset.height,
      seedImages.keep,
    );
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
  }, [asset, strokes, drawing, seedImages]);
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
        seedMasks,
      });
    } catch {
      setError("Could not prepare masks. Please try again.");
    }
  }
  return (
    <div className="mask-editor" data-mode={mode}>
      <div className="toolbar">
        <div className="mode-buttons" data-mode={mode}>
          <button
            type="button"
            aria-pressed={mode === "change"}
            className={mode === "change" ? "mode change active" : "mode change"}
            onClick={() => setMode("change")}
          >
            {t("01 / CHANGE")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "keep"}
            className={mode === "keep" ? "mode keep active" : "mode keep"}
            onClick={() => setMode("keep")}
          >
            {t("02 / KEEP")}
          </button>
        </div>
        <div className="tool-buttons">
          <button
            type="button"
            aria-label={t("Brush")}
            aria-pressed={!erase}
            onClick={() => setErase(false)}
          >
            <Brush size={18} />
          </button>
          <button
            type="button"
            aria-label={t("Erase")}
            aria-pressed={erase}
            onClick={() => setErase(true)}
          >
            <Eraser size={18} />
          </button>
          <button
            type="button"
            aria-label={t("Undo last stroke")}
            disabled={!strokes.length}
            onClick={() => setStrokes((s) => s.slice(0, -1))}
          >
            <Undo2 size={18} />
          </button>
          <button
            type="button"
            aria-label={t("Clear current mask")}
            onClick={() => {
              setStrokes((s) => s.filter((stroke) => stroke.mode !== mode));
              setSeedMasks((s) => ({ ...s, [mode]: undefined }));
            }}
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            aria-label={t("Reset both masks")}
            onClick={() => {
              setStrokes([]);
              setSeedMasks({});
              setError("");
            }}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
      <div className="brush-row">
        <label htmlFor="brush-size">
          {t("Brush size")}
          <strong>{size}px</strong>
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
            ? t("Paint what may change.")
            : t("Paint what must stay.")}
        </span>
      </div>
      <div className="editor-mat">
        <div
          className="paint-frame"
          style={
            {
              aspectRatio: `${asset.width} / ${asset.height}`,
              "--image-ratio": asset.width / asset.height,
            } as CSSProperties
          }
        >
          <img
            src={assetUrl(asset.id)}
            alt={t("Your original image for defining CHANGE and KEEP")}
            draggable={false}
          />
          <canvas
            ref={surfaceRef}
            data-testid="mask-surface"
            aria-label={t(
              "Mask painting surface. Use coordinate controls below for keyboard painting.",
            )}
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
          {t("CHANGE ·")} {stats.changePixels.toLocaleString()} px
        </span>
        <span className="keep-dot">
          {t("KEEP ·")} {stats.keepPixels.toLocaleString()} px
        </span>
        <span>
          {asset.width} {t("×")} {asset.height}
        </span>
      </div>
      <details className="keyboard-paint">
        <summary>{t("Keyboard painting")}</summary>
        <p>
          {t(
            "Set a position as a percentage of the image. Add a brush dab using the current mode and size. Undo and erase work the same way as pointer painting.",
          )}
        </p>
        <div className="coordinate-controls">
          <label>
            {t("X %")}
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
            {t("Y %")}
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
            {t("Add brush dab")}
          </button>
        </div>
      </details>
      {(error || stats.overlap > 0) && (
        <p className="error" role="alert">
          {localText(
            error ||
              "CHANGE and KEEP overlap. Erase the overlap before continuing.",
            t,
          )}
        </p>
      )}
      <button
        type="button"
        className="button primary wide"
        disabled={loadingSeeds}
        onClick={proceed}
      >
        {t("Review edit contract")}
        <span aria-hidden>→</span>
      </button>
    </div>
  );
}
