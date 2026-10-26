import sharp from "sharp";

export type SynthOptions = {
  mode?: "product" | "worn";
  lumFloor?: number;
  edgeTol?: number;
  maskImage?: string | Buffer;
  contrast?: number;
  grow?: number;
  size?: number;
  tileFraction?: number;
  bgTolerance?: number;
  warp?: number;
};

type Raw = { data: Buffer; width: number; height: number; channels: number };

async function loadRaw(input: string | Buffer, resize: sharp.ResizeOptions): Promise<Raw> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(resize)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function backgroundMask(img: Raw, tolerance: number): Uint8Array {
  const { data, width: w, height: h, channels: c } = img;
  const hasAlpha = (() => {
    for (let i = 3; i < data.length; i += c) if (data[i] < 250) return true;
    return false;
  })();
  const garment = new Uint8Array(w * h);
  if (hasAlpha) {
    for (let p = 0; p < w * h; p++) garment[p] = data[p * c + 3] > 127 ? 1 : 0;
    return garment;
  }

  const border: number[][] = [];
  for (let x = 0; x < w; x++) border.push(px(x, 0), px(x, h - 1));
  for (let y = 0; y < h; y++) border.push(px(0, y), px(w - 1, y));
  const bg = [0, 1, 2].map((k) => median(border.map((b) => b[k])));

  function px(x: number, y: number) {
    const i = (y * w + x) * c;
    return [data[i], data[i + 1], data[i + 2]];
  }
  const isBg = (p: number) => {
    const i = p * c;
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    return d < tolerance;
  };

  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!seen[p] && isBg(p)) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  for (let p = 0; p < w * h; p++) garment[p] = seen[p] ? 0 : 1;
  return garment;
}

function wandMask(img: Raw, lumFloor: number, edgeTol: number): Uint8Array {
  const { data, width: w, height: h, channels: c } = img;
  const lumAt = (p: number) => 0.299 * data[p * c] + 0.587 * data[p * c + 1] + 0.114 * data[p * c + 2];
  const chroma = (p: number) => {
    const l = Math.max(1, lumAt(p));
    return [data[p * c] / l, data[p * c + 1] / l, data[p * c + 2] / l];
  };

  const seeds: number[] = [];
  for (let y = Math.floor(h * 0.4); y < h * 0.6; y += 4)
    for (let x = Math.floor(w * 0.42); x < w * 0.58; x += 4) seeds.push(y * w + x);
  const seedLum = median(seeds.map(lumAt));
  const seedChroma = [0, 1, 2].map((k) => median(seeds.map((p) => chroma(p)[k])));

  const accepts = (p: number) => {
    const ch = chroma(p);
    const d = Math.hypot(ch[0] - seedChroma[0], ch[1] - seedChroma[1], ch[2] - seedChroma[2]);
    return lumAt(p) > seedLum * lumFloor && d < 0.14;
  };
  const near = (a: number, b: number) =>
    Math.hypot(data[a * c] - data[b * c], data[a * c + 1] - data[b * c + 1], data[a * c + 2] - data[b * c + 2]) < edgeTol;

  const mask = new Uint8Array(w * h);
  const stack = seeds.filter(accepts);
  for (const s of stack) mask[s] = 1;
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (q < 0 || q >= w * h || mask[q]) continue;
      if (near(p, q) && accepts(q)) {
        mask[q] = 1;
        stack.push(q);
      }
    }
  }

  const outside = new Uint8Array(w * h);
  const fill: number[] = [];
  const visit = (p: number) => {
    if (!mask[p] && !outside[p]) {
      outside[p] = 1;
      fill.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (fill.length) {
    const p = fill.pop()!;
    const x = p % w;
    if (x > 0) visit(p - 1);
    if (x < w - 1) visit(p + 1);
    if (p >= w) visit(p - w);
    if (p < w * (h - 1)) visit(p + w);
  }
  const maxHole = w * h * 0.003;
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (mask[start] || outside[start] || seen[start]) continue;
    const hole = [start];
    seen[start] = 1;
    for (let i = 0; i < hole.length; i++) {
      const p = hole[i];
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q >= 0 && q < w * h && !mask[q] && !outside[q] && !seen[q]) {
          seen[q] = 1;
          hole.push(q);
        }
      }
    }
    if (hole.length <= maxHole) for (const p of hole) mask[p] = 1;
  }
  return mask;
}

async function loadMask(input: string | Buffer, w: number, h: number) {
  const data = await sharp(input).resize(w, h, { fit: "fill" }).greyscale().raw().toBuffer();
  return Uint8Array.from(data, (v) => (v > 127 ? 1 : 0));
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function percentile(values: Float32Array, q: number) {
  const s = Array.from(values).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))] || 1;
}

function refineMask(mask: Uint8Array, img: Raw, lum: Float32Array, white: number, grow: number) {
  const { data, width: w, height: h, channels: c } = img;
  const kept = new Uint8Array(mask);
  for (let p = 0; p < w * h; p++) {
    if (!kept[p]) continue;
    const r = data[p * c], b = data[p * c + 2];
    if (lum[p] < white * 0.55 && r > b + 12) kept[p] = 0;
  }
  for (let step = 0; step < grow; step++) {
    const add: number[] = [];
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (kept[p] || !(kept[p - 1] || kept[p + 1] || kept[p - w] || kept[p + w])) continue;
        const r = data[p * c], g = data[p * c + 1], b = data[p * c + 2];
        if (lum[p] > white * 0.6 && Math.max(r, g, b) - Math.min(r, g, b) < 28) add.push(p);
      }
    for (const p of add) kept[p] = 1;
  }
  return kept;
}

export async function synthesizeGarment(
  silhouette: string | Buffer,
  swatch: string | Buffer,
  {
    mode = "product",
    lumFloor = 0.62,
    edgeTol = 24,
    maskImage,
    size = 1024,
    tileFraction = 0.3,
    bgTolerance = 38,
    warp = 6,
    contrast = 1.8,
    grow = 4,
  }: SynthOptions = {},
): Promise<{ image: Buffer; mask: Buffer }> {
  const sil = await loadRaw(silhouette, { width: size, height: size, fit: "inside" });
  const { width: w, height: h, channels: c } = sil;
  const rawMask = maskImage
    ? await loadMask(maskImage, w, h)
    : mode === "worn"
      ? wandMask(sil, lumFloor, edgeTol)
      : backgroundMask(sil, bgTolerance);

  const lum = new Float32Array(w * h);
  const inside: number[] = [];
  for (let p = 0; p < w * h; p++) {
    const i = p * c;
    lum[p] = 0.299 * sil.data[i] + 0.587 * sil.data[i + 1] + 0.114 * sil.data[i + 2];
    if (rawMask[p]) inside.push(lum[p]);
  }
  if (inside.length < w * h * 0.02) throw new Error("Could not find the garment in the silhouette image");
  const white = percentile(Float32Array.from(inside), 0.9);
  const mask = refineMask(rawMask, sil, lum, white, grow);

  let minX = w, maxX = 0;
  for (let p = 0; p < w * h; p++)
    if (mask[p]) {
      const x = p % w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }

  const tileW = Math.max(64, Math.round((maxX - minX) * tileFraction));
  const tile = await loadRaw(swatch, { width: tileW });
  const { width: tw, height: th, channels: tc } = tile;
  const wrap = (v: number, n: number) => ((v % n) + n) % n;
  const blendWidth = Math.min(tw, th) * 0.2;
  const sample = (u: number, v: number, k: number) => {
    const u0 = wrap(u, tw), v0 = wrap(v, th);
    const u1 = wrap(u0 + (tw >> 1), tw), v1 = wrap(v0 + (th >> 1), th);
    const a = Math.min(1, Math.min(u0, tw - 1 - u0, v0, th - 1 - v0) / blendWidth);
    return a * tile.data[(v0 * tw + u0) * tc + k] + (1 - a) * tile.data[(v1 * tw + u1) * tc + k];
  };

  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += mask[yy * w + xx];
          n++;
        }
      alpha[y * w + x] = sum / n;
    }

  const out = Buffer.alloc(w * h * 3, 255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const bg = mode === "worn" ? [sil.data[p * c], sil.data[p * c + 1], sil.data[p * c + 2]] : [255, 255, 255];
      if (alpha[p] === 0) {
        out.set(bg, p * 3);
        continue;
      }
      const gx = x > 0 && x < w - 1 ? (lum[p + 1] - lum[p - 1]) / 255 : 0;
      const gy = y > 0 && y < h - 1 ? (lum[p + w] - lum[p - w]) / 255 : 0;
      const u = Math.round(x + gx * warp), v = Math.round(y + gy * warp);
      const shade = lum[p] / white;
      const base = Math.max(0.12, 1 - (1 - Math.min(shade, 1)) * contrast);
      const highlight = Math.max(0, shade - 1) * 120;
      for (let k = 0; k < 3; k++) {
        const value = Math.min(255, sample(u, v, k) * base + highlight);
        out[p * 3 + k] = Math.round(value * alpha[p] + bg[k] * (1 - alpha[p]));
      }
    }

  const image = await sharp(out, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
  const maskPng = await sharp(Buffer.from(mask.map((m) => m * 255)), { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
  return { image, mask: maskPng };
}
