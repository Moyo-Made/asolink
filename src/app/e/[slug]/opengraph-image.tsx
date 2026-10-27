import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getEventBySlug, getLooks } from "@/lib/db";
import { daysUntil, formatDate } from "@/lib/format";
import { downloadImage } from "@/lib/youcam";

export const alt = "Aso ebi details";
export const size = { width: 1200, height: 630 };
export const contentType = "image/jpeg";

// WhatsApp drops link-preview images that are slow or heavy, so the fabric is shrunk
// before rendering and the card is sent as a cached JPEG rather than a ~1 MB PNG.
async function backdrop(url: string | undefined) {
  if (!url) return null;
  try {
    const jpeg = await sharp(await downloadImage(url))
      .rotate()
      .resize(size.width, size.height, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  const looks = event ? await getLooks(event.id) : [];
  const fabric = await backdrop(looks[0]?.source_url);
  const days = daysUntil(event?.deadline);
  const meta = [
    event?.event_date ? formatDate(event.event_date) : null,
    event?.price_naira != null ? `NGN ${event.price_naira.toLocaleString("en-NG")}` : null,
    days != null && days >= 0 ? `Orders close in ${days} day${days === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  const png = new ImageResponse(
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
  const jpeg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
