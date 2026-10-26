import "server-only";
import { sql, toEvent, type EventRow, type LookRow } from "./db";
import { hashToken } from "./tokens";

export async function getEventByAdminToken(token: string) {
  const rows = await sql()`select * from events where admin_token_hash = ${hashToken(token)}`;
  return rows[0] ? toEvent(rows[0]) : null;
}

export type GuestSummary = {
  id: string;
  name: string;
  lookId: string | null;
  lookLabel: string | null;
  size: string | null;
  qty: number;
  previewUrl: string | null;
  updatedAt: string;
};

export async function getSummary(event: EventRow) {
  const db = sql();
  const [looks, guests, counts] = await Promise.all([
    db`select * from looks where event_id = ${event.id} order by sort`.then((r) => r as LookRow[]),
    db`
      select g.id, g.name, g.look_id, l.label as look_label, g.size, g.qty, t.result_url, g.updated_at
      from guests g
      left join looks l on l.id = g.look_id
      left join tryons t on t.id = g.tryon_id
      where g.event_id = ${event.id} and g.status = 'confirmed'
      order by g.updated_at desc`.then(
      (r) =>
        r as {
        id: string;
        name: string;
        look_id: string | null;
        look_label: string | null;
        size: string | null;
        qty: number;
        result_url: string | null;
          updated_at: string;
        }[],
    ),
    db`
      select
        (select count(*) from visits where event_id = ${event.id})::int as visitors,
        (select count(distinct device) from tryons where event_id = ${event.id} and status = 'success')::int as tried,
        (select count(*) from tryons where event_id = ${event.id} and status <> 'error')::int as previews
    `.then((r) => r as { visitors: number; tried: number; previews: number }[]),
  ]);

  const confirmed = guests.length;
  const pieces = guests.reduce((s, g) => s + g.qty, 0);
  const sizeTable = looks.map((l) => ({
    lookId: l.id,
    label: l.label,
    counts: Object.fromEntries(
      event.sizes.map((size) => [
        size,
        guests.filter((g) => g.look_id === l.id && g.size === size).reduce((s, g) => s + g.qty, 0),
      ]),
    ),
  }));

  return {
    confirmed,
    pieces,
    revenue: event.price_naira != null ? pieces * event.price_naira : null,
    undecided: Math.max(0, counts[0].visitors - confirmed),
    visitors: counts[0].visitors,
    tried: counts[0].tried,
    previewsUsed: counts[0].previews,
    previewCap: event.tryon_cap,
    sizes: event.sizes,
    sizeTable,
    guests: guests.map(
      (g): GuestSummary => ({
        id: g.id,
        name: g.name,
        lookId: g.look_id,
        lookLabel: g.look_label,
        size: g.size,
        qty: g.qty,
        previewUrl: g.result_url,
        updatedAt: g.updated_at,
      }),
    ),
  };
}

export type Summary = Awaited<ReturnType<typeof getSummary>>;
