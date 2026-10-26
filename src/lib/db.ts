import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function sql() {
  client ??= neon(process.env.DATABASE_URL!);
  return client;
}

export type EventRow = {
  id: string;
  slug: string;
  title: string;
  hosts: string | null;
  event_date: string | null;
  deadline: string | null;
  price_naira: number | null;
  whatsapp: string;
  sizes: string[];
  note: string | null;
  tryon_cap: number;
  created_at: string;
};

export type LookRow = {
  id: string;
  event_id: string;
  label: string;
  kind: "outfit" | "fabric";
  source_url: string;
  silhouette: string | null;
  ref_url: string;
  sort: number;
};

export type TryonRow = {
  id: string;
  event_id: string;
  look_id: string;
  device: string;
  src_url: string;
  task_id: string | null;
  status: "queued" | "running" | "success" | "error";
  error_code: string | null;
  result_url: string | null;
  last_polled_at: string | null;
  created_at: string;
  finished_at: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (v: unknown) =>
  v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : (v as string | null);

export function toEvent(row: Record<string, unknown>): EventRow {
  return { ...(row as EventRow), event_date: isoDay(row.event_date), deadline: isoDay(row.deadline) };
}

export async function getEventBySlug(slug: string) {
  const rows = await sql()`select * from events where slug = ${slug}`;
  return rows[0] ? toEvent(rows[0]) : null;
}

export async function getLooks(eventId: string) {
  return (await sql()`select * from looks where event_id = ${eventId} order by sort, created_at`) as LookRow[];
}
