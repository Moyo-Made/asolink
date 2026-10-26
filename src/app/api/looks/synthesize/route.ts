import path from "node:path";
import { z } from "zod";
import { isOurBlobUrl, putJpeg } from "@/lib/blob";
import { silhouetteById } from "@/lib/silhouettes";
import { synthesizeGarment } from "@/lib/swatch";
import { downloadImage } from "@/lib/youcam";

export const maxDuration = 60;

const Body = z.object({
  fabricUrl: z.string().refine(isOurBlobUrl, "Upload the fabric photo first"),
  silhouette: z.string().refine((id) => !!silhouetteById(id), "Pick a style"),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { fabricUrl, silhouette } = parsed.data;

  const dir = path.join(process.cwd(), "silhouettes");
  const fabric = await downloadImage(fabricUrl);
  const { image } = await synthesizeGarment(path.join(dir, `${silhouette}.jpg`), fabric, {
    mode: "worn",
    maskImage: path.join(dir, `${silhouette}.mask.png`),
  });
  const refUrl = await putJpeg(`refs/${silhouette}.jpg`, image);
  return Response.json({ refUrl });
}
