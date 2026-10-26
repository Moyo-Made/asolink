import "server-only";
import { put } from "@vercel/blob";

function storeId() {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  return token.split("_")[3]?.toLowerCase();
}

export function isOurBlobUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".public.blob.vercel-storage.com")) return false;
    const id = storeId();
    return !id || url.hostname.startsWith(`${id}.`);
  } catch {
    return false;
  }
}

export async function putJpeg(pathname: string, body: Buffer) {
  const blob = await put(pathname, body, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return blob.url;
}
