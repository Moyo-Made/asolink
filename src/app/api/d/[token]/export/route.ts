import { getEventByAdminToken, getSummary } from "@/lib/dashboard";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(_request: Request, ctx: RouteContext<"/api/d/[token]/export">) {
  const { token } = await ctx.params;
  const event = await getEventByAdminToken(token);
  if (!event) return new Response("Not found", { status: 404 });
  const summary = await getSummary(event);
  const rows = [
    ["Name", "Style", "Size", "Quantity", "Amount (NGN)", "Preview", "Confirmed at"],
    ...summary.guests.map((g) => [
      g.name,
      g.lookLabel,
      g.size,
      g.qty,
      event.price_naira != null ? event.price_naira * g.qty : "",
      g.previewUrl ?? "",
      new Date(g.updatedAt).toISOString(),
    ]),
  ];
  const csv = rows.map((r) => r.map(cell).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${event.slug}-orders.csv"`,
    },
  });
}
