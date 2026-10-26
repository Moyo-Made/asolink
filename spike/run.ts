import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { createClient, download, YouCamError, type Feature, type GarmentCategory } from "./youcam.ts";
import { synthesizeGarment } from "../src/lib/swatch.ts";
import { writeReport } from "./report.ts";
import { createMockClient } from "./mock.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const IMAGES = process.env.SPIKE_IMAGES ?? join(ROOT, "test-images");
const OUT = process.env.SPIKE_OUT ?? join(ROOT, "spike-results");
const UNITS_PER_CALL = 2;

const { values: args } = parseArgs({
  options: {
    yes: { type: "boolean", default: false },
    budget: { type: "string", default: "120" },
    people: { type: "string", default: "6" },
    selfies: { type: "string", default: "2" },
    garments: { type: "string", default: "4" },
    fabrics: { type: "string", default: "3" },
    silhouettes: { type: "string", default: "2" },
    templates: { type: "string", default: "full_body_gold_sequins,full_body_white_chiffon" },
    "skip-raw": { type: "boolean", default: false },
    "skip-template": { type: "boolean", default: false },
    mock: { type: "boolean", default: false },
  },
});

export type Test = "outfit" | "outfit-explicit" | "synth" | "raw-swatch" | "fabric-template";

export type Job = {
  id: string;
  test: Test;
  feature: Feature;
  person: string;
  personType: "selfie" | "full";
  input: string;
  category?: GarmentCategory;
  templateId?: string;
  srcPath: string;
  refPath?: string;
  outputPath?: string;
  status?: "success" | "error" | "skipped";
  error?: string;
  errorMessage?: string;
  taskId?: string;
  uploadMs?: number;
  taskMs?: number;
  totalMs?: number;
  polls?: number;
  creditBefore?: number;
  creditAfter?: number;
  unitDelta?: number;
  startedAt?: string;
};

const isImage = (f: string) => /\.(jpe?g|png|webp|heic)$/i.test(f);
const stem = (f: string) => basename(f, extname(f)).replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();

async function listImages(dir: string) {
  const path = join(IMAGES, dir);
  if (!existsSync(path)) return [];
  return (await readdir(path)).filter((f) => isImage(f) && !f.includes(".mask.")).sort().map((f) => join(path, f));
}

async function normalize(src: string, dest: string, longSide = 1024, quality = 82) {
  if (existsSync(dest)) return dest;
  await sharp(src)
    .rotate()
    .resize({ width: longSide, height: longSide, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality, mozjpeg: true })
    .toFile(dest);
  return dest;
}

const personType = (file: string): "selfie" | "full" =>
  /selfie|chest|upper|half/i.test(basename(file)) ? "selfie" : "full";

async function loadPrevious(): Promise<Job[]> {
  const file = join(OUT, "results.json");
  if (!existsSync(file)) return [];
  return JSON.parse(await readFile(file, "utf8"));
}

async function main() {
  const budget = Number(args.budget);
  for (const d of ["inputs/people", "inputs/garments", "inputs/fabrics", "inputs/synth", "inputs/templates", "outputs"])
    await mkdir(join(OUT, d), { recursive: true });

  const allPeople = await listImages("people");
  const garments = (await listImages("garments")).slice(0, Number(args.garments));
  const fabrics = (await listImages("fabrics")).slice(0, Number(args.fabrics));
  const silhouettes = (await listImages("silhouettes")).slice(0, Number(args.silhouettes));

  const selfies = allPeople.filter((p) => personType(p) === "selfie");
  const fulls = allPeople.filter((p) => personType(p) === "full");
  const wanted = Number(args.people);
  const pickedSelfies = selfies.slice(0, Number(args.selfies));
  const people = [...pickedSelfies, ...fulls.slice(0, wanted - pickedSelfies.length)].slice(0, wanted);
  const fullPeople = people.filter((p) => personType(p) === "full");

  if (!people.length) throw new Error(`No people photos in ${join(IMAGES, "people")}`);

  const norm = {
    people: new Map<string, string>(),
    garments: new Map<string, string>(),
    fabrics: new Map<string, string>(),
    synth: [] as { fabric: string; path: string }[],
  };
  for (const p of people) norm.people.set(p, await normalize(p, join(OUT, "inputs/people", `${stem(p)}.jpg`)));
  for (const g of garments) norm.garments.set(g, await normalize(g, join(OUT, "inputs/garments", `${stem(g)}.jpg`)));
  for (const f of fabrics) norm.fabrics.set(f, await normalize(f, join(OUT, "inputs/fabrics", `${stem(f)}.jpg`)));

  for (const f of fabrics)
    for (const sil of silhouettes) {
      const dest = join(OUT, "inputs/synth", `${stem(f)}__${stem(sil)}.jpg`);
      if (!existsSync(dest)) {
        const mode = /worn/i.test(basename(sil)) ? "worn" : "product";
        const maskFile = sil.replace(/\.[a-z]+$/i, ".mask.png");
        const maskImage = existsSync(maskFile) ? maskFile : undefined;
        const { image, mask } = await synthesizeGarment(sil, f, { mode, maskImage });
        await writeFile(dest, image);
        await writeFile(join(OUT, "inputs/synth", `${stem(sil)}.mask.png`), mask);
      }
      norm.synth.push({ fabric: f, path: dest });
    }

  const apiKey = process.env.YOUCAM_API_KEY;
  const client = args.mock ? createMockClient() : apiKey ? createClient(apiKey) : null;

  let templateIds: string[] = [];
  if (client && !args["skip-template"]) {
    const templates = await client.listFabricTemplates();
    await writeFile(join(OUT, "inputs/templates/templates.json"), JSON.stringify(templates, null, 2));
    const known = new Set(templates.map((t) => t.id));
    templateIds = args.templates.split(",").filter((id) => known.has(id));
    if (!templateIds.length && templates[0]) templateIds = [templates[0].id];
    console.log(`Fabric templates available: ${templates.length}`);
  }

  const jobs: Job[] = [];
  const add = (j: Omit<Job, "id" | "srcPath" | "personType"> & { personFile: string }) => {
    const { personFile, ...rest } = j;
    const id = `${rest.test}__${stem(personFile)}__${stem(rest.input)}`;
    jobs.push({ id, personType: personType(personFile), srcPath: norm.people.get(personFile)!, ...rest });
  };

  for (const p of people)
    for (const g of garments)
      add({ test: "outfit", feature: "cloth-v4", personFile: p, person: stem(p), input: stem(g), category: "auto", refPath: norm.garments.get(g) });

  if (garments[0])
    for (const p of fullPeople)
      add({ test: "outfit-explicit", feature: "cloth-v4", personFile: p, person: stem(p), input: stem(garments[0]), category: "full_body", refPath: norm.garments.get(garments[0]) });

  for (const p of fullPeople)
    for (const synth of norm.synth)
      add({ test: "synth", feature: "cloth-v4", personFile: p, person: stem(p), input: basename(synth.path, ".jpg"), category: "full_body", refPath: synth.path });

  if (!args["skip-raw"] && fabrics[0] && fullPeople[0])
    add({ test: "raw-swatch", feature: "cloth-v4", personFile: fullPeople[0], person: stem(fullPeople[0]), input: stem(fabrics[0]), category: "full_body", refPath: norm.fabrics.get(fabrics[0]) });

  for (const templateId of templateIds)
    for (const p of [...new Set([fullPeople[0], fullPeople.at(-1)!])])
      add({ test: "fabric-template", feature: "fabric", personFile: p, person: stem(p), input: templateId, templateId });

  const previous = await loadPrevious();
  const finished = (j: Job) => j.status === "success" || (j.status === "error" && j.error !== "script_error");
  const done = new Map(previous.filter(finished).map((j) => [j.id, j]));
  const interrupted = new Map(previous.filter((j) => j.error === "script_error" && j.taskId).map((j) => [j.id, j.taskId!]));
  const pending = jobs.filter((j) => !done.has(j.id));
  for (const j of pending) j.taskId = interrupted.get(j.id);
  const priorUnits = new Map(previous.filter((j) => j.error === "script_error").map((j) => [j.id, j.unitDelta ?? 0]));

  console.log(`\nPeople: ${people.map((p) => `${stem(p)} (${personType(p)})`).join(", ")}`);
  console.log(`Garments: ${garments.map(stem).join(", ") || "none"}`);
  console.log(`Fabrics: ${fabrics.map(stem).join(", ") || "none"}  Silhouettes: ${silhouettes.map(stem).join(", ") || "none"}`);
  console.log(`\nPlanned jobs: ${jobs.length}, already done: ${jobs.length - pending.length}, to run: ${pending.length}`);
  for (const j of pending) console.log(`  - ${j.id}`);
  const toCreate = pending.filter((j) => !j.taskId).length;
  console.log(`Resuming ${pending.length - toCreate} interrupted task(s) for free.`);
  console.log(`Estimated cost: ${toCreate * UNITS_PER_CALL} units (budget ${budget})`);

  if (!client) {
    console.log("\nNo YOUCAM_API_KEY in .env.local, dry run only.");
    return;
  }
  const balance = await client.getCredit();
  console.log(`Current balance: ${balance} units`);
  if (!args.yes) {
    console.log("\nDry run. Re-run with --yes to spend units.");
    return;
  }

  const results = new Map(previous.map((j) => [j.id, j]));
  const save = async () => {
    const list = [...results.values()];
    await writeFile(join(OUT, "results.json"), JSON.stringify(list, null, 2));
    await writeReport(OUT, list);
  };

  const fileIds = new Map<string, string>();
  const ensureUploaded = async (path: string) => {
    if (!fileIds.has(path)) fileIds.set(path, await client.uploadFile(await readFile(path), basename(path)));
    return fileIds.get(path)!;
  };

  let spent = 0;
  for (const job of pending) {
    if (!job.taskId && spent + UNITS_PER_CALL > budget) {
      console.log(`Budget reached, skipping ${job.id}`);
      continue;
    }
    const t0 = Date.now();
    job.startedAt = new Date().toISOString();
    let stage = "credit";
    try {
      job.creditBefore = await client.getCredit();
      if (job.creditBefore < UNITS_PER_CALL) {
        console.log("Out of units, stopping.");
        break;
      }
      const t1 = Date.now();
      if (!job.taskId) {
        stage = "upload";
        const src = await ensureUploaded(job.srcPath);
        const ref = job.refPath ? await ensureUploaded(job.refPath) : undefined;
        job.uploadMs = Date.now() - t0;
        const params: Record<string, unknown> =
          job.feature === "fabric"
            ? { src_file_id: src, template_id: job.templateId }
            : { src_file_id: src, ref_file_id: ref, garment_category: job.category };
        stage = "create";
        job.taskId = await client.createTask(job.feature, params);
      }
      stage = "poll";
      const result = await client.waitForTask(job.feature, job.taskId);
      job.taskMs = Date.now() - t1;
      job.polls = result.polls;
      job.status = result.status === "success" ? "success" : "error";
      job.error = result.error;
      job.errorMessage = result.errorMessage;

      if (result.resultUrl) {
        stage = "download";
        const dest = join(OUT, "outputs", `${job.id}.jpg`);
        await sharp(await download(result.resultUrl)).jpeg({ quality: 88 }).toFile(dest);
        job.outputPath = dest;
      }
    } catch (e) {
      job.status = "error";
      job.error = e instanceof YouCamError ? (e.code ?? `http_${e.httpStatus}`) : "script_error";
      job.errorMessage = `${stage}: ${(e as Error).message}`;
    }
    job.totalMs = Date.now() - t0;
    try {
      job.creditAfter = await client.getCredit();
      const delta = Math.round(((job.creditBefore ?? job.creditAfter) - job.creditAfter) * 100) / 100;
      job.unitDelta = delta + (priorUnits.get(job.id) ?? 0);
      spent += delta;
    } catch {
      spent += UNITS_PER_CALL;
    }
    results.set(job.id, job);
    await save();
    console.log(
      `${job.status === "success" ? "OK " : "ERR"} ${job.id}  ${((job.totalMs ?? 0) / 1000).toFixed(1)}s  units=${job.unitDelta ?? "?"}${job.error ? `  ${job.error}: ${job.errorMessage ?? ""}` : ""}`,
    );
  }

  await save();
  console.log(`\nDone. Spent ${spent} units. Open spike-results/index.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
