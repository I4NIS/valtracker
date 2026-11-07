export type ThumbJob = { id: number; url: string; width: number; height: number };

export type ThumbReply = { id: number; blob: Blob } | { id: number; error: string };

const CACHE = "thumbs-v1";
const QUALITY = 0.85;
const DENSITY = 2;

export function thumbKey(url: string, width: number, height: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}thumb=${width}x${height}`;
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

async function download(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { mode: "cors" });
  } catch {
    response = await fetch(url, { mode: "cors", cache: "reload" });
  }
  if (!response.ok) throw new Error(String(response.status));
  return response.blob();
}

async function pngSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  const head = new DataView(await blob.slice(0, 24).arrayBuffer());
  if (head.byteLength < 24 || head.getUint32(0) !== 0x89504e47 || head.getUint32(12) !== 0x49484452) return null;
  return { width: head.getUint32(16), height: head.getUint32(20) };
}

async function shrink(source: Blob, width: number, height: number): Promise<Blob> {
  let full: ImageBitmap | null = null;
  let size = await pngSize(source);
  if (!size) {
    full = await createImageBitmap(source);
    size = { width: full.width, height: full.height };
  }
  const scale = Math.max((width * DENSITY) / size.width, (height * DENSITY) / size.height);
  if (scale >= 1) {
    full?.close();
    return source;
  }
  const target = { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
  const options: ImageBitmapOptions = { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" };
  const bitmap = await (full ? createImageBitmap(full, options) : createImageBitmap(source, options));
  full?.close();
  const canvas = new OffscreenCanvas(target.width, target.height);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("canvas");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
}

export async function makeThumb(url: string, width: number, height: number): Promise<Blob> {
  const key = thumbKey(url, width, height);
  const cache = await openCache();
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return hit.blob();
  const thumb = await shrink(await download(url), width, height);
  await cache
    ?.put(key, new Response(thumb, { headers: { "content-type": thumb.type || "image/webp" } }))
    .catch(() => undefined);
  return thumb;
}
