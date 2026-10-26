"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Summary } from "@/lib/dashboard";
import { naira } from "@/lib/format";

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function Dashboard({
  token,
  slug,
  title,
  price,
  initial,
}: {
  token: string;
  slug: string;
  title: string;
  price: number | null;
  initial: Summary;
}) {
  const [data, setData] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/d/${token}/summary`, { cache: "no-store" });
        if (res.ok) setData(await res.json());
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [token]);

  const totalsBySize = Object.fromEntries(
    data.sizes.map((s) => [s, data.sizeTable.reduce((sum, row) => sum + (row.counts[s] ?? 0), 0)]),
  );

  async function copyList() {
    const lines = [
      `${title}: aso ebi orders`,
      "",
      ...data.guests.map((g) => `${g.name}: ${g.lookLabel ?? ""} ${g.size} × ${g.qty}`),
      "",
      "Sizes to sew:",
      ...data.sizeTable.map(
        (r) =>
          `${r.label}: ${data.sizes
            .filter((s) => r.counts[s])
            .map((s) => `${s} × ${r.counts[s]}`)
            .join(", ") || "none yet"}`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="font-display text-xl">
          AsoLink
        </Link>
        <Link href={`/e/${slug}`} className="text-sm font-semibold underline underline-offset-4">
          Guest page
        </Link>
      </div>

      <h1 className="mt-8 font-display text-4xl leading-tight">{title}</h1>
      <p className="mt-1 text-sm text-ink-soft">Updates on its own every few seconds.</p>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border-2 border-ink bg-ink sm:grid-cols-4">
        {[
          ["Ordered", `${data.confirmed} ${data.confirmed === 1 ? "guest" : "guests"}`],
          ["Sets to sew", String(data.pieces)],
          ["Expected", price != null ? naira(data.revenue) : "–"],
          ["Opened, not ordered", String(data.undecided)],
        ].map(([label, value]) => (
          <div key={label} className="bg-paper px-4 py-3">
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="mt-0.5 font-display text-2xl">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink-soft">
        {data.tried} {data.tried === 1 ? "guest has" : "guests have"} seen a preview · {data.previewsUsed} of {data.previewCap} previews used
      </p>

      <section className="mt-10" aria-labelledby="sizes">
        <h2 id="sizes" className="font-display text-2xl">
          Sizes to sew
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border-2 border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-line text-left">
                <th className="px-3 py-2 font-semibold">Style</th>
                {data.sizes.map((s) => (
                  <th key={s} className="px-3 py-2 text-center font-semibold">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.sizeTable.map((row) => (
                <tr key={row.lookId} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">{row.label}</td>
                  {data.sizes.map((s) => (
                    <td key={s} className={`px-3 py-2 text-center tabular-nums ${row.counts[s] ? "font-semibold" : "text-ink-soft/50"}`}>
                      {row.counts[s] || "·"}
                    </td>
                  ))}
                </tr>
              ))}
              {data.sizeTable.length > 1 && (
                <tr className="border-t-2 border-line bg-wash">
                  <td className="px-3 py-2 font-semibold">All styles</td>
                  {data.sizes.map((s) => (
                    <td key={s} className="px-3 py-2 text-center font-semibold tabular-nums">
                      {totalsBySize[s] || "·"}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="guests">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="guests" className="font-display text-2xl">
            Guests who ordered
          </h2>
          <div className="flex gap-2">
            <button type="button" onClick={copyList} className="h-10 rounded-md border-2 border-ink px-3 text-sm font-semibold">
              {copied ? "Copied" : "Copy list"}
            </button>
            <a href={`/api/d/${token}/export`} className="flex h-10 items-center rounded-md bg-ink px-3 text-sm font-semibold text-white">
              Download CSV
            </a>
          </div>
        </div>

        {data.guests.length === 0 ? (
          <div className="mt-4 rounded-lg border-2 border-dashed border-line p-6 text-center">
            <p className="font-semibold">No orders yet</p>
            <p className="mt-1 text-sm text-ink-soft">Share the guest link in your WhatsApp group. Orders show up here as they come in.</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-lg border-2 border-line bg-white">
            {data.guests.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-3 py-3">
                {g.previewUrl ? (
                  <button
                    type="button"
                    onClick={() => setPreview({ name: g.name, url: g.previewUrl! })}
                    className="shrink-0 overflow-hidden rounded-md"
                    aria-label={`See ${g.name}'s preview`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.previewUrl} alt="" className="h-14 w-11 object-cover object-top" loading="lazy" />
                  </button>
                ) : (
                  <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md bg-wash font-display text-lg">
                    {g.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{g.name}</p>
                  <p className="truncate text-sm text-ink-soft">{g.lookLabel}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">
                    {g.size} × {g.qty}
                  </p>
                  <p className="text-xs text-ink-soft">{timeAgo(g.updatedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${preview.name}'s preview`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          onClick={() => setPreview(null)}
        >
          <figure className="max-h-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={`${preview.name} in the aso ebi`} className="max-h-[80dvh] rounded-lg object-contain" />
            <figcaption className="mt-2 text-center text-sm text-white">
              {preview.name} · visual preview, not a fit guarantee
            </figcaption>
          </figure>
        </div>
      )}
    </main>
  );
}
