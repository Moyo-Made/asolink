import { readFile } from "node:fs/promises";
import { put } from "@vercel/blob";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PERSON = process.argv[3] ?? "scripts/fixtures/guest.jpg";
const FABRIC = process.argv[4] ?? "scripts/fixtures/fabric-lace.jpg";
let cookie = "";

async function api<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...init.headers },
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return { status: res.status, body: (await res.json()) as T };
}

function check(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAILED: ${label}`);
  console.log(`ok  ${label}`);
}

const upload = async (path: string, folder: string) =>
  (await put(`uploads/${folder}/smoke.jpg`, await readFile(path), { access: "public", addRandomSuffix: true })).url;

const fabricUrl = await upload(FABRIC, "fabrics");
const personUrl = await upload(PERSON, "guests");
check(fabricUrl && personUrl, "uploaded fabric and guest photo to Blob");

const synth = await api<{ refUrl?: string; error?: string }>("/api/looks/synthesize", {
  method: "POST",
  body: JSON.stringify({ fabricUrl, silhouette: "kaftan" }),
});
check(synth.status === 200 && synth.body.refUrl, `synthesized garment ${synth.body.refUrl ?? synth.body.error}`);

const bad = await api<{ error?: string }>("/api/looks/synthesize", {
  method: "POST",
  body: JSON.stringify({ fabricUrl: "https://example.com/x.jpg", silhouette: "kaftan" }),
});
check(bad.status === 400, "rejects fabric URLs outside our Blob store");

const created = await api<{ slug: string; adminToken: string; error?: string }>("/api/events", {
  method: "POST",
  body: JSON.stringify({
    title: "Smoke Test Wedding",
    hosts: "QA family",
    eventDate: "2026-12-12",
    deadline: "2026-11-30",
    price: 35000,
    whatsapp: "0803 123 4567",
    sizes: ["S", "M", "L"],
    looks: [{ label: "Lace kaftan", kind: "fabric", sourceUrl: fabricUrl, silhouette: "kaftan", refUrl: synth.body.refUrl }],
  }),
});
check(created.status === 200 && created.body.slug, `created event /e/${created.body.slug}`);
const { slug, adminToken } = created.body;

const page = await fetch(`${BASE}/e/${slug}`);
check(page.status === 200 && (await page.text()).includes("Smoke Test Wedding"), "guest page renders");

const visit = await api<{ ok: boolean }>("/api/visit", { method: "POST", body: JSON.stringify({ slug }) });
check(visit.body.ok && cookie.startsWith("asolink_device="), "visit recorded and device cookie set");

const summary0 = await api<{ sizeTable: { lookId: string }[] }>(`/api/d/${adminToken}/summary`);
const lookId = summary0.body.sizeTable[0].lookId;

const t0 = Date.now();
const started = await api<{ id: string; status: string }>("/api/tryons", {
  method: "POST",
  body: JSON.stringify({ slug, lookId, srcUrl: personUrl }),
});
check(started.status === 200 && started.body.status === "running", `try-on started (${started.body.status})`);

let tryon: { status: string; resultUrl: string | null; message: string | null } = { status: "running", resultUrl: null, message: null };
while (tryon.status === "running" && Date.now() - t0 < 180_000) {
  await new Promise((r) => setTimeout(r, 3000));
  tryon = (await api<typeof tryon>(`/api/tryons/${started.body.id}`)).body;
}
check(tryon.status === "success" && tryon.resultUrl, `try-on finished in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${tryon.resultUrl ?? tryon.message}`);

const again = await api<{ id: string }>("/api/tryons", { method: "POST", body: JSON.stringify({ slug, lookId, srcUrl: personUrl }) });
check(again.body.id === started.body.id, "same photo + style reuses the cached preview (no extra units)");

const order = await api<{ whatsappUrl?: string; error?: string }>("/api/guests", {
  method: "POST",
  body: JSON.stringify({ slug, name: "Adaeze Smoke", lookId, size: "M", qty: 2, tryonId: started.body.id }),
});
check(order.body.whatsappUrl?.startsWith("https://wa.me/2348031234567?text="), "order returns wa.me link to coordinator");
console.log(decodeURIComponent(order.body.whatsappUrl!.split("text=")[1]).replace(/^/gm, "    "));

const badSize = await api<{ error?: string }>("/api/guests", {
  method: "POST",
  body: JSON.stringify({ slug, name: "X Y", lookId, size: "XXXL", qty: 1 }),
});
check(badSize.status === 400, "rejects sizes the coordinator didn't list");

const summary = await api<{ confirmed: number; pieces: number; revenue: number; sizeTable: { counts: Record<string, number> }[] }>(
  `/api/d/${adminToken}/summary`,
);
check(summary.body.confirmed === 1 && summary.body.pieces === 2 && summary.body.revenue === 70000, "dashboard counts 1 guest, 2 sets, ₦70,000");
check(summary.body.sizeTable[0].counts.M === 2, "size table shows M × 2");

const csv = await fetch(`${BASE}/api/d/${adminToken}/export`).then((r) => r.text());
check(csv.includes("Adaeze Smoke"), "CSV export includes the order");

const wrong = await fetch(`${BASE}/api/d/not-a-real-token/summary`);
check(wrong.status === 404, "wrong dashboard token is rejected");

console.log(`\nGuest page:  ${BASE}/e/${slug}\nDashboard:   ${BASE}/d/${adminToken}`);
