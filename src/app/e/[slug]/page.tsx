import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { GuestFlow } from "@/components/GuestFlow";
import { getEventBySlug, getLooks } from "@/lib/db";
import { daysUntil, formatDate, naira } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/e/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return {};
  const price = naira(event.price_naira);
  return {
    title: event.title,
    description: `See the aso ebi on yourself, pick your size and order${price ? ` (${price})` : ""}.`,
  };
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const looks = await getLooks(event.id);
  const hero = looks[0];
  const daysLeft = daysUntil(event.deadline);
  const closed = daysLeft != null && daysLeft < 0;

  return (
    <main className="mx-auto min-h-dvh max-w-lg pb-16">
      <div className="relative h-[46dvh] min-h-72 overflow-hidden bg-ink">
        {hero && (
          <Image
            src={hero.source_url}
            alt={`The aso ebi ${hero.kind === "fabric" ? "fabric" : "outfit"} for ${event.title}`}
            fill
            priority
            sizes="(max-width: 512px) 100vw, 512px"
            className="object-cover"
          />
        )}
      </div>

      <section className="label-card relative z-10 mx-4 -mt-20 bg-paper px-6 pb-6 pt-7">
        <h1 className="font-display text-[2.15rem] leading-[1.05] text-ink">{event.title}</h1>
        {event.hosts && <p className="mt-2 text-ink-soft">{event.hosts}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
          {event.event_date && (
            <div>
              <dt className="text-ink-soft">Event</dt>
              <dd className="font-semibold">{formatDate(event.event_date)}</dd>
            </div>
          )}
          {event.price_naira != null && (
            <div>
              <dt className="text-ink-soft">Price</dt>
              <dd className="font-semibold">{naira(event.price_naira)}</dd>
            </div>
          )}
          {daysLeft != null && (
            <div className="col-span-2">
              <dt className="text-ink-soft">Orders</dt>
              <dd className={`font-semibold ${closed ? "text-coral" : ""}`}>
                {closed
                  ? `Closed on ${formatDate(event.deadline)}`
                  : daysLeft === 0
                    ? "Close today"
                    : `Close in ${daysLeft} day${daysLeft === 1 ? "" : "s"}, on ${formatDate(event.deadline)}`}
              </dd>
            </div>
          )}
        </dl>
        {event.note && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{event.note}</p>}
      </section>

      <GuestFlow
        slug={event.slug}
        closed={closed}
        price={event.price_naira}
        sizes={event.sizes}
        looks={looks.map((l) => ({ id: l.id, label: l.label, kind: l.kind, refUrl: l.ref_url, sourceUrl: l.source_url }))}
      />
    </main>
  );
}
