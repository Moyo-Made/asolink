import { z } from "zod";
import { isOurBlobUrl } from "@/lib/blob";
import { getEventBySlug, sql, type TryonRow } from "@/lib/db";
import { getDevice } from "@/lib/device";
import { publicTryon } from "@/lib/tryons";
import { tryonErrorMessage } from "@/lib/tryon-errors";
import { createClothesTask, YouCamError } from "@/lib/youcam";

const PER_DEVICE = 3;
const PER_DAY = Number(process.env.MAX_TRYONS_PER_DAY ?? 200);

const Body = z.object({
  slug: z.string().min(1),
  lookId: z.string().uuid(),
  srcUrl: z.string().refine(isOurBlobUrl, "Upload your photo first"),
});

const limited = (code: string) =>
  Response.json({ error: code, message: tryonErrorMessage(code) }, { status: 429 });

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid", message: parsed.error.issues[0].message }, { status: 400 });
  const { slug, lookId, srcUrl } = parsed.data;

  const event = await getEventBySlug(slug);
  if (!event) return Response.json({ error: "not_found", message: "This event link doesn't exist." }, { status: 404 });
  const db = sql();
  const [look] = (await db`select id, ref_url from looks where id = ${lookId} and event_id = ${event.id}`) as {
    id: string;
    ref_url: string;
  }[];
  if (!look) return Response.json({ error: "not_found", message: "That style isn't part of this event." }, { status: 404 });

  const device = await getDevice();

  const [cached] = (await db`
    select * from tryons where look_id = ${lookId} and src_url = ${srcUrl} and status in ('running', 'success')
    order by created_at desc limit 1`) as TryonRow[];
  if (cached) return Response.json(publicTryon(cached));

  const [{ mine, total, today }] = (await db`
    select
      count(*) filter (where event_id = ${event.id} and device = ${device} and status <> 'error')::int as mine,
      count(*) filter (where event_id = ${event.id} and status <> 'error')::int as total,
      count(*) filter (where created_at > now() - interval '1 day')::int as today
    from tryons`) as { mine: number; total: number; today: number }[];
  if (mine >= PER_DEVICE) return limited("limit_device");
  if (total >= event.tryon_cap || today >= PER_DAY) return limited("limit_event");

  const [row] = (await db`
    insert into tryons (event_id, look_id, device, src_url) values (${event.id}, ${lookId}, ${device}, ${srcUrl})
    returning *`) as TryonRow[];

  try {
    const taskId = await createClothesTask(srcUrl, look.ref_url);
    const [running] = (await db`
      update tryons set task_id = ${taskId}, status = 'running' where id = ${row.id} returning *`) as TryonRow[];
    return Response.json(publicTryon(running));
  } catch (e) {
    const code = e instanceof YouCamError ? (e.code ?? `http_${e.httpStatus}`) : "network";
    const [failed] = (await db`
      update tryons set status = 'error', error_code = ${code}, finished_at = now() where id = ${row.id} returning *`) as TryonRow[];
    return Response.json(publicTryon(failed), { status: 502 });
  }
}
