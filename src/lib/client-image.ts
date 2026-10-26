import { upload } from "@vercel/blob/client";

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  }
}

export async function compressImage(file: File, longSide = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await decode(file);
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap.source, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read this photo"))), "image/jpeg", quality),
  );
}

export async function uploadPhoto(
  file: File,
  folder: "guests" | "fabrics" | "outfits",
  onProgress?: (percent: number) => void,
) {
  const blob = await compressImage(file);
  const result = await upload(`uploads/${folder}/photo.jpg`, blob, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: "image/jpeg",
    onUploadProgress: ({ percentage }) => onProgress?.(percentage),
  });
  return result.url;
}
