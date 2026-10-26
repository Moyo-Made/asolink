import { getEventByAdminToken, getSummary } from "@/lib/dashboard";

export async function GET(_request: Request, ctx: RouteContext<"/api/d/[token]/summary">) {
  const { token } = await ctx.params;
  const event = await getEventByAdminToken(token);
  if (!event) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(await getSummary(event), { headers: { "cache-control": "no-store" } });
}
