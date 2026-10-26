import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { Job } from "./run.ts";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const secs = (ms?: number) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)}s`);

function median(xs: number[]) {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const TEST_LABELS: Record<string, string> = {
  outfit: "Clothes VTO · finished outfit",
  "outfit-explicit": "Clothes VTO · finished outfit (full_body)",
  synth: "Clothes VTO · swatch → synthesized garment",
  "raw-swatch": "Clothes VTO · raw swatch as ref",
  "fabric-template": "Fabric VTO · preset template",
};

export function stats(jobs: Job[]) {
  const ran = jobs.filter((j) => j.status === "success" || j.status === "error");
  const ok = ran.filter((j) => j.status === "success");
  const times = ok.map((j) => j.totalMs!).filter(Boolean);
  const taskTimes = ok.map((j) => j.taskMs!).filter(Boolean);
  const byTest = Object.keys(TEST_LABELS).map((t) => {
    const r = ran.filter((j) => j.test === t);
    const s = r.filter((j) => j.status === "success");
    return { test: t, ran: r.length, ok: s.length, median: median(s.map((j) => j.totalMs!)), units: r.map((j) => j.unitDelta) };
  });
  const errors = new Map<string, number>();
  for (const j of ran.filter((j) => j.status === "error")) errors.set(j.error ?? "unknown", (errors.get(j.error ?? "unknown") ?? 0) + 1);
  return {
    ran: ran.length,
    ok: ok.length,
    medianMs: median(times),
    medianTaskMs: median(taskTimes),
    slowest: ok.reduce<Job | undefined>((a, j) => (!a || j.totalMs! > a.totalMs! ? j : a), undefined),
    units: ran.reduce((s, j) => s + (j.unitDelta ?? 0), 0),
    failuresCharged: ran.filter((j) => j.status === "error" && (j.unitDelta ?? 0) > 0).length,
    failures: ran.filter((j) => j.status === "error").length,
    byTest,
    errors,
  };
}

export async function writeReport(out: string, jobs: Job[]) {
  const rel = (p?: string) => (p ? esc(relative(out, p)) : "");
  const s = stats(jobs);
  const people = [...new Set(jobs.map((j) => j.person))];
  const columns = [...new Map(jobs.map((j) => [`${j.test}::${j.input}`, j])).values()];

  const templatesFile = join(out, "inputs/templates/templates.json");
  const templates: { id: string; thumb: string; title: string }[] = existsSync(templatesFile)
    ? JSON.parse(await readFile(templatesFile, "utf8"))
    : [];
  const thumbFor = (id?: string) => templates.find((t) => t.id === id)?.thumb;

  const cell = (j?: Job) => {
    if (!j) return `<td class="na">–</td>`;
    const badge =
      j.status === "success" ? `<span class="b ok">ok</span>` : j.status === "error" ? `<span class="b err">${esc(j.error)}</span>` : `<span class="b">pending</span>`;
    const img = j.outputPath ? `<a href="${rel(j.outputPath)}" target="_blank"><img src="${rel(j.outputPath)}" loading="lazy"></a>` : `<div class="ph">${esc(j.errorMessage ?? "")}</div>`;
    return `<td>${img}<div class="meta">${badge} ${secs(j.totalMs)} · ${j.unitDelta ?? "?"}u</div></td>`;
  };

  const header = columns
    .map((c) => {
      const src = c.refPath ? `<img src="${rel(c.refPath)}">` : thumbFor(c.templateId) ? `<img src="${esc(thumbFor(c.templateId))}">` : "";
      return `<th><div class="test">${esc(TEST_LABELS[c.test])}</div>${src}<div class="name">${esc(c.input)}</div></th>`;
    })
    .join("");

  const rows = people
    .map((p) => {
      const first = jobs.find((j) => j.person === p)!;
      const cells = columns.map((c) => cell(jobs.find((j) => j.person === p && j.test === c.test && j.input === c.input))).join("");
      return `<tr><th class="person"><img src="${rel(first.srcPath)}"><div class="name">${esc(p)}<br><small>${first.personType}</small></div></th>${cells}</tr>`;
    })
    .join("");

  const byTest = s.byTest
    .filter((t) => t.ran)
    .map((t) => `<li><b>${esc(TEST_LABELS[t.test])}</b>: ${t.ok}/${t.ran} ok, median ${secs(t.median)}, units ${t.units.join(", ")}</li>`)
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AsoLink spike</title><style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#faf8f5;color:#1d1a16}
h1{font-size:20px;margin:0 0 8px}.sum{display:flex;gap:24px;flex-wrap:wrap;margin:8px 0 16px}
.sum div{background:#fff;border:1px solid #e6e0d8;border-radius:8px;padding:8px 12px}.sum b{display:block;font-size:20px}
.wrap{overflow-x:auto}table{border-collapse:collapse}td,th{border:1px solid #e6e0d8;padding:6px;vertical-align:top;background:#fff}
th img{width:120px;height:160px;object-fit:contain;background:#f1ece5;display:block}td img{width:220px;height:300px;object-fit:contain;background:#f1ece5;display:block}
.test{font-size:11px;color:#7a6f63;width:120px}.name{font-size:12px;word-break:break-all;max-width:220px}
.meta{font-size:12px;margin-top:4px}.b{padding:1px 6px;border-radius:4px;background:#eee}.ok{background:#d8f0dc}.err{background:#f6d5d1}
.ph{width:220px;height:300px;display:flex;align-items:center;justify-content:center;text-align:center;color:#a33;font-size:12px;background:#fbf0ee}
.na{color:#bbb;text-align:center}</style></head><body>
<h1>AsoLink · YouCam VTO spike</h1>
<div class="sum"><div><b>${s.ok}/${s.ran}</b>succeeded</div><div><b>${secs(s.medianMs)}</b>median total</div>
<div><b>${secs(s.slowest?.totalMs)}</b>slowest</div><div><b>${s.units}</b>units spent</div>
<div><b>${s.failuresCharged}/${s.failures}</b>failures charged</div></div>
<ul>${byTest}</ul>
<div class="wrap"><table><tr><th></th>${header}</tr>${rows}</table></div></body></html>`;
  await writeFile(join(out, "index.html"), html);

  const csvCols = ["id", "test", "feature", "person", "personType", "input", "category", "status", "error", "errorMessage", "uploadMs", "taskMs", "totalMs", "polls", "unitDelta", "creditBefore", "creditAfter", "startedAt"] as const;
  const csv = [csvCols.join(","), ...jobs.map((j) => csvCols.map((c) => JSON.stringify(j[c] ?? "")).join(","))].join("\n");
  await writeFile(join(out, "results.csv"), csv);

  const md = `# Spike stats (auto-generated)

- Success: ${s.ok}/${s.ran}
- Median total time (upload + task): ${secs(s.medianMs)}; median task time: ${secs(s.medianTaskMs)}
- Slowest: ${secs(s.slowest?.totalMs)} (${s.slowest?.id ?? "–"})
- Units spent: ${s.units}; failed calls charged: ${s.failuresCharged}/${s.failures}

## By test
${s.byTest.filter((t) => t.ran).map((t) => `- ${TEST_LABELS[t.test]}: ${t.ok}/${t.ran} ok, median ${secs(t.median)}, units per call ${t.units.join(", ")}`).join("\n")}

## Errors
${[...s.errors].map(([e, n]) => `- ${e}: ${n}`).join("\n") || "- none"}
`;
  await writeFile(join(out, "stats.md"), md);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = new URL("../spike-results", import.meta.url).pathname;
  const jobs = JSON.parse(await readFile(join(out, "results.json"), "utf8"));
  await writeReport(out, jobs);
  console.log("Report written to spike-results/index.html");
}
