import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";

export const metadata: Metadata = { title: "Aso ebi preview", robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [row] = (await sql()`
    select t.result_url, l.label, e.title, e.slug
    from tryons t join looks l on l.id = t.look_id join events e on e.id = t.event_id
    where t.id = ${id} and t.status = 'success'`) as { result_url: string; label: string; title: string; slug: string }[];
  if (!row) notFound();

  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <Link href={`/e/${row.slug}`} className="font-display text-xl">
        {row.title}
      </Link>
      <figure className="mt-6">
        <div className="relative overflow-hidden rounded-lg bg-wash">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.result_url} alt={`Guest preview in the ${row.label}`} className="w-full object-contain" />
          <figcaption className="absolute left-3 top-3 rounded bg-ink/85 px-2.5 py-1 text-xs font-semibold text-white">
            Visual preview, not a fit guarantee
          </figcaption>
        </div>
        <p className="mt-3 text-sm text-ink-soft">{row.label}</p>
      </figure>
    </main>
  );
}
