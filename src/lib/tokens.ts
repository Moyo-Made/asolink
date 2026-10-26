import { createHash, randomBytes } from "node:crypto";

export const randomToken = (bytes = 18) => randomBytes(bytes).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function slugify(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = Array.from(randomBytes(4), (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
  return base ? `${base}-${suffix}` : suffix;
}
