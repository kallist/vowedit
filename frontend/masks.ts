export type Point = { x: number; y: number };
export type Stroke = {
  mode: "change" | "keep";
  erase: boolean;
  size: number;
  points: Point[];
};
export function pointInImage(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Point {
  return {
    x: Math.max(
      0,
      Math.min(width, ((clientX - rect.left) / rect.width) * width),
    ),
    y: Math.max(
      0,
      Math.min(height, ((clientY - rect.top) / rect.height) * height),
    ),
  };
}
export function renderMask(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  mode: Stroke["mode"],
  width: number,
  height: number,
  seed?: HTMLImageElement,
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  if (seed) {
    ctx.drawImage(seed, 0, 0, width, height);
    const pixels = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = pixels.data[i] >= 128 ? 255 : 0;
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = value;
    }
    ctx.putImageData(pixels, 0, 0);
  }
  for (const stroke of strokes.filter((s) => s.mode === mode)) {
    ctx.globalCompositeOperation = stroke.erase
      ? "destination-out"
      : "source-over";
    ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = stroke.size;
    const first = stroke.points[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const p of stroke.points) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}
export function maskStats(change: Uint8ClampedArray, keep: Uint8ClampedArray) {
  let changePixels = 0,
    keepPixels = 0,
    overlap = 0;
  for (let i = 3; i < change.length; i += 4) {
    const c = change[i] >= 128,
      k = keep[i] >= 128;
    if (c) changePixels++;
    if (k) keepPixels++;
    if (c && k) overlap++;
  }
  return { changePixels, keepPixels, overlap };
}
export async function maskBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const ctx = output.getContext("2d")!;
  const pixels = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = pixels.data[i + 3] >= 128 ? 255 : 0;
    pixels.data[i] = value;
    pixels.data[i + 1] = value;
    pixels.data[i + 2] = value;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) =>
    output.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not save mask.")),
      "image/png",
    ),
  );
}
