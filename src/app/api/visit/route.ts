import { getEventBySlug, sql } from "@/lib/db";
import { getDevice } from "@/lib/device";

export async function POST(request: Request) {
  const { slug } = (await request.json().catch(() => ({}))) as { slug?: string };
  const event = slug ? await getEventBySlug(slug) : null;
  if (!event) return Response.json({ ok: false }, { status: 404 });
  const device = await getDevice();
  await sql()`insert into visits (event_id, device) values (${event.id}, ${device}) on conflict do nothing`;
  const [guest] = (await sql()`
    select g.name, g.size, g.qty, g.look_id, g.tryon_id, t.result_url
    from guests g left join tryons t on t.id = g.tryon_id
    where g.event_id = ${event.id} and g.device = ${device} and g.status = 'confirmed'`) as {
    name: string;
    size: string;
    qty: number;
    look_id: string;
    tryon_id: string | null;
    result_url: string | null;
  }[];
  return Response.json({ ok: true, order: guest ?? null });
}
