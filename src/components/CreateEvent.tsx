"use client";

import { useState } from "react";
import { uploadPhoto } from "@/lib/client-image";
import type { Silhouette } from "@/lib/silhouettes";
import { ShareKit } from "./ShareKit";

type LookDraft = {
  key: string;
  label: string;
  kind: "fabric" | "outfit";
  sourceUrl: string | null;
  silhouette: string | null;
  refUrl: string | null;
  busy: string | null;
  error: string | null;
};

const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

const newLook = (key: string = crypto.randomUUID()): LookDraft => ({
  key,
  label: "",
  kind: "fabric",
  sourceUrl: null,
  silhouette: null,
  refUrl: null,
  busy: null,
  error: null,
});

const field =
  "mt-2 h-11 w-full rounded-md border-2 border-line bg-white px-3 placeholder:text-ink-soft/60 focus:border-ink focus:outline-none";

export function CreateEvent({ silhouettes }: { silhouettes: Silhouette[] }) {
  const [title, setTitle] = useState("");
  const [hosts, setHosts] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [price, setPrice] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [sizes, setSizes] = useState<string[]>(["S", "M", "L", "XL", "XXL"]);
  const [customSize, setCustomSize] = useState("");
  const [note, setNote] = useState("");
  const [looks, setLooks] = useState<LookDraft[]>(() => [newLook("look-0")]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ slug: string; adminToken: string; title: string } | null>(null);

  const update = (key: string, patch: Partial<LookDraft>) =>
    setLooks((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function synthesize(key: string, fabricUrl: string, silhouette: string) {
    update(key, { busy: "Sewing the fabric into the style…", error: null, refUrl: null });
    try {
      const res = await fetch("/api/looks/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fabricUrl, silhouette }),
      });
      const data = (await res.json()) as { refUrl?: string; error?: string };
      if (!res.ok || !data.refUrl) throw new Error(data.error);
      update(key, { refUrl: data.refUrl, busy: null });
    } catch (e) {
      update(key, { busy: null, error: (e as Error).message || "That didn't work. Try again." });
    }
  }

  async function onUpload(look: LookDraft, file: File | undefined) {
    if (!file) return;
    update(look.key, { busy: "Uploading…", error: null, refUrl: null });
    try {
      const url = await uploadPhoto(file, look.kind === "fabric" ? "fabrics" : "outfits", (p) =>
        update(look.key, { busy: `Uploading… ${Math.round(p)}%` }),
      );
      if (look.kind === "outfit") {
        update(look.key, { sourceUrl: url, refUrl: url, busy: null });
      } else {
        update(look.key, { sourceUrl: url, busy: null });
        if (look.silhouette) await synthesize(look.key, url, look.silhouette);
      }
    } catch {
      update(look.key, { busy: null, error: "The photo didn't upload. Check your connection and try again." });
    }
  }

  function pickSilhouette(look: LookDraft, id: string) {
    const s = silhouettes.find((x) => x.id === id);
    update(look.key, { silhouette: id, label: look.label || s?.label || "" });
    if (look.sourceUrl) synthesize(look.key, look.sourceUrl, id);
  }

  function toggleSize(s: string) {
    setSizes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const incomplete = looks.find((l) => !l.refUrl || !l.sourceUrl);
    if (incomplete) return setError("Finish each style: add a photo and, for fabric, pick a cut.");
    if (looks.some((l) => !l.label.trim())) return setError("Name each style, for example “Ladies' gown”.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          hosts,
          eventDate: eventDate || null,
          deadline: deadline || null,
          price: price ? Number(price.replace(/\D/g, "")) : null,
          whatsapp,
          sizes,
          note,
          looks: looks.map((l) => ({
            label: l.label.trim(),
            kind: l.kind,
            sourceUrl: l.sourceUrl,
            silhouette: l.kind === "fabric" ? l.silhouette : null,
            refUrl: l.refUrl,
          })),
        }),
      });
      const data = (await res.json()) as { slug?: string; adminToken?: string; error?: string };
      if (!res.ok || !data.slug || !data.adminToken) throw new Error(data.error);
      try {
        const mine = JSON.parse(localStorage.getItem("asolink:mine") ?? "[]");
        localStorage.setItem(
          "asolink:mine",
          JSON.stringify([{ title, slug: data.slug, adminToken: data.adminToken }, ...mine].slice(0, 20)),
        );
      } catch {}
      setCreated({ slug: data.slug, adminToken: data.adminToken, title });
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message || "The link wasn't created. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) return <ShareKit {...created} />;

  return (
    <form onSubmit={submit} className="mt-10 space-y-12" noValidate>
      <section className="space-y-5" aria-labelledby="details">
        <h2 id="details" className="font-display text-2xl">
          The event
        </h2>
        <label className="block">
          <span className="text-sm font-semibold">Event name</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tolu & Femi's wedding" required />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Hosted by (optional)</span>
          <input className={field} value={hosts} onChange={(e) => setHosts(e.target.value)} placeholder="The Adeyemi family" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Event date</span>
            <input type="date" className={field} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Orders close</span>
            <input type="date" className={field} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold">Price per set (₦)</span>
            <input inputMode="numeric" className={field} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="35000" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold">Your WhatsApp</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className={field}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="0803 123 4567"
            />
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Sizes guests can pick</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...new Set([...SIZE_PRESETS, ...sizes])].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={sizes.includes(s)}
                onClick={() => toggleSize(s)}
                className={`h-10 min-w-11 rounded-md border-2 px-3 font-semibold ${
                  sizes.includes(s) ? "border-ink bg-marigold" : "border-line bg-white text-ink-soft"
                }`}
              >
                {s}
              </button>
            ))}
            <span className="flex">
              <input
                aria-label="Add a size"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                placeholder="Other"
                className="h-10 w-20 rounded-l-md border-2 border-r-0 border-line bg-white px-2 text-sm focus:border-ink focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const s = customSize.trim();
                  if (s && !sizes.includes(s)) setSizes((cur) => [...cur, s]);
                  setCustomSize("");
                }}
                className="h-10 rounded-r-md border-2 border-line bg-wash px-3 text-sm font-semibold"
              >
                Add
              </button>
            </span>
          </div>
        </fieldset>
        <label className="block">
          <span className="text-sm font-semibold">Note for guests (optional)</span>
          <textarea
            className={`${field} h-24 py-2`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Payment details, pickup point, colour of gele…"
          />
        </label>
      </section>

      <section className="space-y-6" aria-labelledby="styles">
        <div>
          <h2 id="styles" className="font-display text-2xl">
            The aso ebi
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Upload the fabric and pick a cut, or upload a photo of the sewn outfit. Add up to three styles, for example
            one for ladies and one for men.
          </p>
        </div>

        {looks.map((look, i) => (
          <div key={look.key} className="rounded-lg border-2 border-line bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">Style {i + 1}</p>
              {looks.length > 1 && (
                <button
                  type="button"
                  className="text-sm font-semibold text-coral"
                  onClick={() => setLooks((ls) => ls.filter((l) => l.key !== look.key))}
                >
                  Remove
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 rounded-md bg-wash p-1 text-sm font-semibold" role="radiogroup" aria-label="What are you uploading?">
              {(["fabric", "outfit"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={look.kind === k}
                  onClick={() => update(look.key, { kind: k, sourceUrl: null, refUrl: null, error: null })}
                  className={`h-9 rounded ${look.kind === k ? "bg-white shadow-sm" : "text-ink-soft"}`}
                >
                  {k === "fabric" ? "Fabric" : "Sewn outfit"}
                </button>
              ))}
            </div>

            {look.kind === "fabric" && (
              <fieldset className="mt-4">
                <legend className="text-sm font-semibold">Cut</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {silhouettes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={look.silhouette === s.id}
                      onClick={() => pickSilhouette(look, s.id)}
                      className={`overflow-hidden rounded-md border-2 text-left ${
                        look.silhouette === s.id ? "border-ink" : "border-line"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/styles/${s.id}.webp`} alt="" className="aspect-[3/4] w-full object-cover object-top" />
                      <span className="block px-2 py-1.5 text-xs font-semibold">{s.label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-4">
              <input
                id={`file-${look.key}`}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => onUpload(look, e.target.files?.[0])}
              />
              <label
                htmlFor={`file-${look.key}`}
                className={`flex h-11 cursor-pointer items-center justify-center rounded-md border-2 border-ink text-sm font-semibold ${
                  look.busy ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {look.sourceUrl ? "Change photo" : look.kind === "fabric" ? "Upload fabric photo" : "Upload outfit photo"}
              </label>
              <p className="mt-1.5 text-xs text-ink-soft">
                {look.kind === "fabric"
                  ? "Lay the fabric flat and shoot straight down in daylight."
                  : "One person wearing the outfit, standing and facing the camera."}
              </p>
            </div>

            {(look.busy || look.refUrl || look.error) && (
              <div className="mt-4" aria-live="polite">
                {look.busy && <p className="text-sm font-semibold">{look.busy}</p>}
                {look.error && <p className="text-sm font-semibold text-coral">{look.error}</p>}
                {look.refUrl && !look.busy && (
                  <div className="grid grid-cols-[120px_1fr] gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={look.refUrl} alt="How the style will look" className="aspect-[3/4] w-full rounded-md object-cover object-top" />
                    <p className="text-sm text-ink-soft">
                      {look.kind === "fabric"
                        ? "This is the outfit guests will try on. If the fabric looks wrong, try a flatter, brighter photo."
                        : "Guests will try on this outfit."}
                    </p>
                  </div>
                )}
              </div>
            )}

            <label className="mt-4 block">
              <span className="text-sm font-semibold">Style name</span>
              <input
                className={field}
                value={look.label}
                onChange={(e) => update(look.key, { label: e.target.value })}
                placeholder="Ladies' gown"
              />
            </label>
          </div>
        ))}

        {looks.length < 3 && (
          <button
            type="button"
            onClick={() => setLooks((ls) => [...ls, newLook()])}
            className="h-11 w-full rounded-md border-2 border-dashed border-line text-sm font-semibold text-ink-soft"
          >
            Add another style
          </button>
        )}
      </section>

      <div className="space-y-3">
        {error && (
          <p className="text-sm font-semibold text-coral" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || looks.some((l) => !!l.busy)}
          className="h-13 w-full rounded-lg bg-ink text-base font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Creating your link…" : "Create link"}
        </button>
      </div>
    </form>
  );
}
