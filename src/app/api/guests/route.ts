import { z } from "zod";
import { getEventBySlug, sql } from "@/lib/db";
import { getDevice } from "@/lib/device";
import { orderMessage, waLink } from "@/lib/whatsapp";

const Body = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(2, "Add your name").max(60),
  lookId: z.string().uuid(),
  size: z.string().trim().min(1, "Pick a size").max(12),
  qty: z.number().int().min(1).max(20),
  tryonId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const b = parsed.data;

  const event = await getEventBySlug(b.slug);
  if (!event) return Response.json({ error: "This event link doesn't exist." }, { status: 404 });
  if (!event.sizes.includes(b.size)) return Response.json({ error: "Pick one of the listed sizes." }, { status: 400 });

  const db = sql();
  const [look] = (await db`select id, label from looks where id = ${b.lookId} and event_id = ${event.id}`) as {
    id: string;
    label: string;
  }[];
  if (!look) return Response.json({ error: "That style isn't part of this event." }, { status: 400 });

  const device = await getDevice();
  let tryonId: string | null = null;
  if (b.tryonId) {
    const [t] = (await db`
      select id from tryons where id = ${b.tryonId} and event_id = ${event.id} and device = ${device} and status = 'success'`) as {
      id: string;
    }[];
    tryonId = t?.id ?? null;
  }

  await db`
    insert into guests (event_id, device, name, look_id, size, qty, tryon_id, status)
    values (${event.id}, ${device}, ${b.name}, ${look.id}, ${b.size}, ${b.qty}, ${tryonId}, 'confirmed')
    on conflict (event_id, device) do update set
      name = excluded.name, look_id = excluded.look_id, size = excluded.size, qty = excluded.qty,
      tryon_id = coalesce(excluded.tryon_id, guests.tryon_id), status = 'confirmed', updated_at = now()`;

  const origin = new URL(request.url).origin;
  const text = orderMessage({
    eventTitle: event.title,
    guestName: b.name,
    lookLabel: look.label,
    size: b.size,
    qty: b.qty,
    price: event.price_naira,
    previewUrl: tryonId ? `${origin}/p/${tryonId}` : null,
  });
  return Response.json({ whatsappUrl: waLink(event.whatsapp, text) });
}
