import { refreshTryon, publicTryon } from "@/lib/tryons";

export const maxDuration = 60;

export async function GET(_request: Request, ctx: RouteContext<"/api/tryons/[id]">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const row = await refreshTryon(id);
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(publicTryon(row), { headers: { "cache-control": "no-store" } });
}
