"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";

export function ShareKit({ slug, adminToken, title }: { slug: string; adminToken: string; title: string }) {
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const guestUrl = `${origin}/e/${slug}`;
  const adminUrl = `${origin}/d/${adminToken}`;
  const groupMessage = `Aso ebi for ${title} is here 🎉\nSee the fabric on yourself, pick your size and order:\n${guestUrl}`;

  useEffect(() => {
    if (origin) QRCode.toDataURL(guestUrl, { margin: 1, width: 480, color: { dark: "#1B2559" } }).then(setQr);
  }, [origin, guestUrl]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  }

  return (
    <div className="mt-10 space-y-10">
      <section className="label-card bg-paper px-6 py-7">
        <h2 className="font-display text-3xl leading-tight">Your link is ready</h2>
        <p className="mt-2 text-ink-soft">Drop it in the family WhatsApp group. Guests don&apos;t need to sign up.</p>
        <p className="mt-5 break-all rounded-md bg-wash px-3 py-2.5 font-semibold">{guestUrl || "…"}</p>
        <div className="mt-4 grid gap-3">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(groupMessage)}`}
            className="flex h-12 items-center justify-center rounded-lg bg-wa font-semibold text-white"
          >
            Share to a WhatsApp group
          </a>
          <button
            type="button"
            onClick={() => copy(guestUrl, "link")}
            className="h-12 rounded-lg border-2 border-ink font-semibold"
          >
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
        </div>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR code for ${guestUrl}`} className="mx-auto mt-6 w-44" />
        )}
      </section>

      <section className="rounded-lg border-2 border-marigold bg-marigold-soft p-5">
        <h2 className="font-display text-2xl">Your order tracker</h2>
        <p className="mt-2 text-sm text-ink-soft">
          This private link shows who has ordered and the sizes to sew. Bookmark it and don&apos;t share it with guests.
        </p>
        <div className="mt-4 grid gap-3">
          <Link
            href={`/d/${adminToken}`}
            className="flex h-12 items-center justify-center rounded-lg bg-ink font-semibold text-white"
          >
            Open order tracker
          </Link>
          <button
            type="button"
            onClick={() => copy(adminUrl, "admin")}
            className="h-12 rounded-lg border-2 border-ink bg-white font-semibold"
          >
            {copied === "admin" ? "Copied" : "Copy private link"}
          </button>
        </div>
      </section>

      <Link href={`/e/${slug}`} className="block text-center font-semibold underline underline-offset-4">
        See what guests see
      </Link>
    </div>
  );
}
