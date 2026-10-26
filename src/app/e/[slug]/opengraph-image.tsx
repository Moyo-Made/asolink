import { ImageResponse } from "next/og";
import { getEventBySlug, getLooks } from "@/lib/db";
import { daysUntil, formatDate } from "@/lib/format";

export const alt = "Aso ebi details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  const looks = event ? await getLooks(event.id) : [];
  const fabric = looks[0]?.source_url;
  const days = daysUntil(event?.deadline);
  const meta = [
    event?.event_date ? formatDate(event.event_date) : null,
    event?.price_naira != null ? `NGN ${event.price_naira.toLocaleString("en-NG")}` : null,
    days != null && days >= 0 ? `Orders close in ${days} day${days === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: "100%", height: "100%", background: "#1B2559" }}>
        {fabric && (
           
          <img src={fabric} alt="" width={1200} height={630} style={{ position: "absolute", objectFit: "cover", width: 1200, height: 630 }} />
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: 56,
            bottom: 56,
            width: 760,
            padding: "40px 44px",
            background: "#FCFCFD",
            border: "3px solid #1B2559",
            boxShadow: "inset 0 0 0 8px #FCFCFD, inset 0 0 0 11px #1B2559",
          }}
        >
          <div style={{ fontSize: 26, color: "#4A5384" }}>Aso ebi · tap to see it on you</div>
          <div style={{ fontSize: 64, lineHeight: 1.05, color: "#1B2559", marginTop: 10 }}>{event?.title ?? "AsoLink"}</div>
          {meta.length > 0 && <div style={{ fontSize: 28, color: "#1B2559", marginTop: 18 }}>{meta.join("  ·  ")}</div>}
        </div>
      </div>
    ),
    size,
  );
}
