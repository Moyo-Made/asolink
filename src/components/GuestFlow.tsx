"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadPhoto } from "@/lib/client-image";
import { naira } from "@/lib/format";

type Look = { id: string; label: string; kind: "outfit" | "fabric"; refUrl: string; sourceUrl: string };

type Tryon = {
  id: string;
  lookId: string;
  status: "queued" | "running" | "success" | "error";
  resultUrl: string | null;
  error: string | null;
  message: string | null;
};

type Stage =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "processing"; tryonId: string; startedAt: number; offline: boolean }
  | { kind: "done"; tryon: Tryon }
  | { kind: "error"; message: string; retryPoll?: string };

type Saved = { lookId?: string; srcUrl?: string; tryonId?: string; name?: string };

const POLL_MS = 3000;
const GIVE_UP_MS = 150_000;

export function GuestFlow({
  slug,
  looks,
  sizes,
  price,
  closed,
}: {
  slug: string;
  looks: Look[];
  sizes: string[];
  price: number | null;
  closed: boolean;
}) {
  const storageKey = `asolink:${slug}`;
  const [lookId, setLookId] = useState(looks[0]?.id ?? "");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [localPhoto, setLocalPhoto] = useState<string | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [qty, setQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<{ whatsappUrl?: string; summary: string } | null>(null);

  const look = looks.find((l) => l.id === lookId) ?? looks[0];
  const doneTryon = stage.kind === "done" ? stage.tryon : null;

  const save = useCallback(
    (patch: Saved) => {
      try {
        const prev = JSON.parse(localStorage.getItem(storageKey) ?? "{}") as Saved;
        localStorage.setItem(storageKey, JSON.stringify({ ...prev, ...patch }));
      } catch {}
    },
    [storageKey],
  );

  const poll = useCallback(
    async (tryonId: string, startedAt = Date.now()) => {
      setStage({ kind: "processing", tryonId, startedAt, offline: false });
      let failures = 0;
      while (Date.now() - startedAt < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        try {
          const res = await fetch(`/api/tryons/${tryonId}`, { cache: "no-store" });
          if (res.status === 404) {
            setStage({ kind: "error", message: "We lost track of this preview. Try your photo again." });
            return;
          }
          const t = (await res.json()) as Tryon;
          failures = 0;
          if (t.status === "success") {
            setStage({ kind: "done", tryon: t });
            return;
          }
          if (t.status === "error") {
            setStage({ kind: "error", message: t.message ?? "The preview didn't work. Try another photo." });
            return;
          }
          setStage((s) => (s.kind === "processing" && s.offline ? { ...s, offline: false } : s));
        } catch {
          failures++;
          if (failures >= 2) setStage((s) => (s.kind === "processing" ? { ...s, offline: true } : s));
        }
      }
      setStage({
        kind: "error",
        message: "This is taking longer than usual. Your preview may still finish.",
        retryPoll: tryonId,
      });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      let saved: Saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      } catch {}
      const visit = fetch("/api/visit", { method: "POST", body: JSON.stringify({ slug }) })
        .then((r) => r.json() as Promise<{ order?: { name: string; size: string; qty: number; look_id: string } | null }>)
        .catch(() => ({ order: null }));
      const previous = saved.tryonId
        ? fetch(`/api/tryons/${saved.tryonId}`, { cache: "no-store" })
            .then((r) => (r.ok ? (r.json() as Promise<Tryon>) : null))
            .catch(() => null)
        : Promise.resolve(null);
      const [{ order }, tryon] = await Promise.all([visit, previous]);
      if (cancelled) return;

      if (saved.lookId && looks.some((l) => l.id === saved.lookId)) setLookId(saved.lookId);
      if (saved.srcUrl) setSrcUrl(saved.srcUrl);
      if (saved.name) setName(saved.name);
      if (tryon?.status === "success") setStage({ kind: "done", tryon });
      else if (tryon && (tryon.status === "running" || tryon.status === "queued")) poll(tryon.id);
      if (order) {
        setName(order.name);
        setSize(order.size);
        setQty(order.qty);
        const l = looks.find((x) => x.id === order.look_id);
        setOrdered({ summary: `${l?.label ?? "Aso ebi"}, size ${order.size}, × ${order.qty}` });
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, [slug, storageKey, looks, poll]);

  async function startTryon(url: string, forLook: string) {
    setStage({ kind: "processing", tryonId: "", startedAt: 0, offline: false });
    try {
      const res = await fetch("/api/tryons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, lookId: forLook, srcUrl: url }),
      });
      const t = (await res.json()) as Tryon & { message?: string };
      if (!res.ok && t.status !== "error") {
        setStage({ kind: "error", message: t.message ?? "The preview didn't start. Try again." });
        return;
      }
      save({ tryonId: t.id, lookId: forLook });
      if (t.status === "success") setStage({ kind: "done", tryon: t });
      else if (t.status === "error") setStage({ kind: "error", message: t.message ?? "Try another photo." });
      else poll(t.id);
    } catch {
      setStage({ kind: "error", message: "No connection. Check your data and try again." });
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setShowOriginal(false);
    setLocalPhoto((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setStage({ kind: "uploading", percent: 0 });
    try {
      const url = await uploadPhoto(file, "guests", (percent) => setStage({ kind: "uploading", percent }));
      setSrcUrl(url);
      save({ srcUrl: url });
      await startTryon(url, lookId);
    } catch {
      setStage({ kind: "error", message: "Your photo didn't upload. Check your connection and try again." });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function chooseLook(id: string) {
    setLookId(id);
    save({ lookId: id });
    if (srcUrl && stage.kind !== "uploading" && stage.kind !== "processing") startTryon(srcUrl, id);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!size) return setFormError("Pick a size.");
    if (name.trim().length < 2) return setFormError("Add your name so the coordinator knows who's ordering.");
    setSubmitting(true);
    save({ name });
    try {
      const res = await fetch("/api/guests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, name, lookId: look.id, size, qty, tryonId: doneTryon?.id ?? null }),
      });
      const data = (await res.json()) as { whatsappUrl?: string; error?: string };
      if (!res.ok || !data.whatsappUrl) {
        setFormError(data.error ?? "Your order didn't go through. Try again.");
        return;
      }
      setOrdered({ whatsappUrl: data.whatsappUrl, summary: `${look.label}, size ${size}, × ${qty}` });
      window.location.href = data.whatsappUrl;
    } catch {
      setFormError("No connection. Check your data and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = stage.kind === "uploading" || stage.kind === "processing";

  return (
    <div className="mt-10 space-y-12 px-4">
      {looks.length > 1 && (
        <section aria-labelledby="style-heading">
          <h2 id="style-heading" className="font-display text-2xl">
            Choose your style
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="style-heading">
            {looks.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={l.id === lookId}
                disabled={busy}
                onClick={() => chooseLook(l.id)}
                className={`overflow-hidden rounded-lg border-2 bg-white text-left transition-colors disabled:opacity-60 ${
                  l.id === lookId ? "border-ink" : "border-line"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.refUrl} alt="" className="aspect-[3/4] w-full object-cover object-top" loading="lazy" />
                <span className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-semibold">
                  {l.label}
                  {l.id === lookId && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-marigold" aria-hidden />}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="tryon-heading">
        <h2 id="tryon-heading" className="font-display text-2xl">
          See it on you
        </h2>

        <div aria-live="polite">
          {stage.kind === "idle" && (
            <div className="mt-4 grid grid-cols-[96px_1fr] gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={look.refUrl} alt={`${look.label} style`} className="aspect-[3/4] w-24 rounded-md object-cover object-top" />
              <ul className="space-y-1.5 text-sm leading-snug text-ink-soft">
                <li>Stand straight, face the camera, arms relaxed at your sides.</li>
                <li>Chest up works. Head to knees shows the whole outfit.</li>
                <li>Just you in the photo, in good light.</li>
              </ul>
            </div>
          )}

          {(stage.kind === "uploading" || stage.kind === "processing") && (
            <div className="mt-4">
              <div className="relative overflow-hidden rounded-lg bg-wash">
                {localPhoto && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={localPhoto} alt="Your photo" className="max-h-[60dvh] w-full object-contain opacity-50" />
                )}
                <div className="stitch absolute inset-x-0 bottom-0 h-[3px] bg-marigold" />
              </div>
              <p className="mt-3 font-semibold">
                {stage.kind === "uploading"
                  ? `Uploading your photo… ${Math.round(stage.percent)}%`
                  : stage.offline
                    ? "Waiting for your connection…"
                    : "Making your preview…"}
              </p>
              {stage.kind === "processing" && (
                <p className="text-sm text-ink-soft">This usually takes 20 to 30 seconds. Keep this page open.</p>
              )}
            </div>
          )}

          {stage.kind === "done" && stage.tryon.resultUrl && (
            <figure className="mt-4">
              <div className="relative overflow-hidden rounded-lg bg-wash">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={showOriginal && localPhoto ? localPhoto : stage.tryon.resultUrl}
                  alt={showOriginal ? "Your original photo" : `You in the ${look.label}`}
                  className="max-h-[70dvh] w-full object-contain"
                />
                <figcaption className="absolute left-3 top-3 rounded bg-ink/85 px-2.5 py-1 text-xs font-semibold text-white">
                  Visual preview, not a fit guarantee
                </figcaption>
              </div>
              {localPhoto && (
                <button
                  type="button"
                  onClick={() => setShowOriginal((v) => !v)}
                  className="mt-2 text-sm font-semibold text-ink underline underline-offset-4"
                >
                  {showOriginal ? "Show the preview" : "Show my original photo"}
                </button>
              )}
            </figure>
          )}

          {stage.kind === "error" && (
            <div className="mt-4 rounded-lg border border-coral/40 bg-coral-soft p-4 text-sm" role="alert">
              <p className="font-semibold text-coral">{stage.message}</p>
              {stage.retryPoll && (
                <button
                  type="button"
                  onClick={() => poll(stage.retryPoll!)}
                  className="mt-2 font-semibold underline underline-offset-4"
                >
                  Check again
                </button>
              )}
            </div>
          )}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          id="photo"
          onChange={(e) => onPhoto(e.target.files?.[0])}
        />
        <label
          htmlFor="photo"
          aria-disabled={busy}
          className={`mt-5 flex h-13 w-full items-center justify-center rounded-lg border-2 border-ink px-5 text-base font-semibold ${
            busy ? "pointer-events-none opacity-50" : "cursor-pointer active:bg-wash"
          } ${stage.kind === "idle" ? "bg-ink text-white active:bg-ink" : "bg-white text-ink"}`}
        >
          {stage.kind === "idle" ? "Take or choose a photo" : "Try another photo"}
        </label>
        <p className="mt-2 text-xs text-ink-soft">
          Your photo is only used to make your preview. The coordinator sees your preview only if you share it with your order.
        </p>
      </section>

      <section aria-labelledby="order-heading">
        <h2 id="order-heading" className="font-display text-2xl">
          Your order
        </h2>

        {ordered && (
          <div className="mt-4 rounded-lg bg-marigold-soft p-4 text-sm">
            <p className="font-semibold">Order saved: {ordered.summary}</p>
            <p className="mt-1 text-ink-soft">Finish by sending the message in WhatsApp. You can change your order below.</p>
            {ordered.whatsappUrl && (
              <a href={ordered.whatsappUrl} className="mt-2 inline-block font-semibold underline underline-offset-4">
                Open WhatsApp again
              </a>
            )}
          </div>
        )}

        <form onSubmit={confirm} className="mt-4 space-y-6" noValidate>
          {looks.length > 1 && (
            <p className="text-sm">
              Style: <span className="font-semibold">{look.label}</span>
            </p>
          )}

          <fieldset>
            <legend className="text-sm font-semibold">Size</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((s) => (
                <label key={s} className="cursor-pointer">
                  <input
                    type="radio"
                    name="size"
                    value={s}
                    checked={size === s}
                    onChange={() => setSize(s)}
                    className="peer sr-only"
                  />
                  <span className="flex h-11 min-w-12 items-center justify-center rounded-md border-2 border-line bg-white px-3 font-semibold peer-checked:border-ink peer-checked:bg-marigold peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-marigold">
                    {s}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex items-end gap-4">
            <label className="block flex-1">
              <span className="text-sm font-semibold">Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="As the coordinator knows you"
                className="mt-2 h-11 w-full rounded-md border-2 border-line bg-white px-3 placeholder:text-ink-soft/60 focus:border-ink focus:outline-none"
              />
            </label>
            <div>
              <span className="text-sm font-semibold" id="qty-label">
                Sets
              </span>
              <div className="mt-2 flex h-11 items-center rounded-md border-2 border-line bg-white" aria-labelledby="qty-label">
                <button
                  type="button"
                  aria-label="One fewer"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="h-full w-10 text-lg font-semibold"
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label="One more"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  className="h-full w-10 text-lg font-semibold"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {price != null && (
            <p className="flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-ink-soft">Total</span>
              <span className="font-display text-2xl">{naira(price * qty)}</span>
            </p>
          )}

          {formError && (
            <p className="text-sm font-semibold text-coral" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || closed}
            className="flex h-13 w-full items-center justify-center gap-2 rounded-lg bg-wa px-5 text-base font-semibold text-white disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="currentColor">
              <path d="M12 3C7 3 3 6.6 3 11c0 2.4 1.2 4.6 3.1 6L5.5 21l4-2.1c.8.2 1.6.3 2.5.3 5 0 9-3.6 9-8s-4-8.2-9-8.2Z" />
            </svg>
            {closed ? "Orders are closed" : submitting ? "Saving your order…" : ordered ? "Update order on WhatsApp" : "Confirm on WhatsApp"}
          </button>
          <p className="text-xs text-ink-soft">
            This opens WhatsApp with your order written out for the coordinator. Pay them directly, as you normally would.
          </p>
        </form>
      </section>
    </div>
  );
}
