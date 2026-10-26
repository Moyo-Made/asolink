import { z } from "zod";
import { isOurBlobUrl } from "@/lib/blob";
import { sql } from "@/lib/db";
import { normalizeWhatsapp } from "@/lib/format";
import { silhouetteById } from "@/lib/silhouettes";
import { hashToken, randomToken, slugify } from "@/lib/tokens";

const blobUrl = z.string().refine(isOurBlobUrl, "Image upload is missing");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

const Look = z.object({
  label: z.string().trim().min(1, "Name each style").max(60),
  kind: z.enum(["outfit", "fabric"]),
  sourceUrl: blobUrl,
  silhouette: z.string().refine((id) => !!silhouetteById(id)).nullable().optional(),
  refUrl: blobUrl,
});

const Body = z.object({
  title: z.string().trim().min(2, "Add the event name").max(80),
  hosts: z.string().trim().max(80).optional(),
  eventDate: isoDate,
  deadline: isoDate,
  price: z.number().int().min(0).max(10_000_000).nullable().optional(),
  whatsapp: z
    .string()
    .transform(normalizeWhatsapp)
    .refine((v) => /^\d{10,15}$/.test(v), "Enter a WhatsApp number like 0803 123 4567"),
  sizes: z.array(z.string().trim().min(1).max(12)).min(1, "Add at least one size").max(12),
  note: z.string().trim().max(400).optional(),
  looks: z.array(Look).min(1, "Add at least one style").max(4),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const e = parsed.data;

  const slug = slugify(e.title);
  const adminToken = randomToken();
  const db = sql();
  const [event] = (await db`
    insert into events (slug, admin_token_hash, title, hosts, event_date, deadline, price_naira, whatsapp, sizes, note)
    values (${slug}, ${hashToken(adminToken)}, ${e.title}, ${e.hosts || null}, ${e.eventDate ?? null}, ${e.deadline ?? null},
            ${e.price ?? null}, ${e.whatsapp}, ${e.sizes}, ${e.note || null})
    returning id`) as { id: string }[];

  await db.transaction(
    e.looks.map(
      (l, i) => db`
        insert into looks (event_id, label, kind, source_url, silhouette, ref_url, sort)
        values (${event.id}, ${l.label}, ${l.kind}, ${l.sourceUrl}, ${l.silhouette ?? null}, ${l.refUrl}, ${i})`,
    ),
  );

  return Response.json({ slug, adminToken });
}
