import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { synthesizeGarment } from "../src/lib/swatch.ts";

const [image, polygonJson, previewFabric, previewOut, lumFloor = "0.62"] = process.argv.slice(2);
const points: [number, number][] = JSON.parse(polygonJson);

const { mask } = await synthesizeGarment(image, previewFabric, { mode: "worn", lumFloor: Number(lumFloor) });
const { width: w, height: h } = await sharp(mask).metadata();
const svg = `<svg width="${w}" height="${h}"><rect width="100%" height="100%" fill="black"/><polygon fill="white" points="${points
  .map(([x, y]) => `${x * w!},${y * h!}`)
  .join(" ")}"/></svg>`;
const poly = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer();
const wand = await sharp(mask).greyscale().raw().toBuffer();
const out = Buffer.from(wand.map((v, i) => (v > 127 && poly[i] > 127 ? 255 : 0)));
const maskPath = image.replace(/\.[a-z]+$/i, ".mask.png");
await sharp(out, { raw: { width: w!, height: h!, channels: 1 } }).png().toFile(maskPath);

const { image: preview } = await synthesizeGarment(image, previewFabric, { mode: "worn", maskImage: maskPath });
await writeFile(previewOut, preview);
console.log(`Wrote ${maskPath}`);
