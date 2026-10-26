import "server-only";
import sharp from "sharp";
import { putJpeg } from "./blob";
import { sql, type TryonRow } from "./db";
import { tryonErrorMessage } from "./tryon-errors";
import { downloadImage, getClothesTask, YouCamError } from "./youcam";

const TIMEOUT_MS = 3 * 60_000;

export function publicTryon(t: TryonRow) {
  return {
    id: t.id,
    lookId: t.look_id,
    status: t.status,
    resultUrl: t.result_url,
    error: t.status === "error" ? (t.error_code ?? "unknown") : null,
    message: t.status === "error" ? tryonErrorMessage(t.error_code) : null,
    createdAt: t.created_at,
  };
}

export async function refreshTryon(id: string): Promise<TryonRow | null> {
  const db = sql();
  const [row] = (await db`select * from tryons where id = ${id}`) as TryonRow[];
  if (!row || row.status !== "running" || !row.task_id) return row ?? null;

  const [claimed] = (await db`
    update tryons set last_polled_at = now()
    where id = ${id} and status = 'running'
      and (last_polled_at is null or last_polled_at < now() - interval '3 seconds')
    returning *`) as TryonRow[];
  if (!claimed) return row;

  try {
    const task = await getClothesTask(claimed.task_id!, claimed.src_url);
    if (task.status === "success" && task.resultUrl) {
      const raw = await downloadImage(task.resultUrl);
      const jpeg = await sharp(raw)
        .rotate()
        .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();
      const resultUrl = await putJpeg(`results/${id}.jpg`, jpeg);
      const [done] = (await db`
        update tryons set status = 'success', result_url = ${resultUrl}, finished_at = now()
        where id = ${id} and status = 'running' returning *`) as TryonRow[];
      return done ?? claimed;
    }
    if (task.status === "error") {
      const [failed] = (await db`
        update tryons set status = 'error', error_code = ${task.error ?? "unknown"}, finished_at = now()
        where id = ${id} and status = 'running' returning *`) as TryonRow[];
      return failed ?? claimed;
    }
  } catch (e) {
    if (e instanceof YouCamError && e.code === "InvalidTaskId") {
      const [failed] = (await db`
        update tryons set status = 'error', error_code = 'timeout', finished_at = now()
        where id = ${id} returning *`) as TryonRow[];
      return failed;
    }
  }

  if (Date.now() - new Date(claimed.created_at).getTime() > TIMEOUT_MS) {
    const [failed] = (await db`
      update tryons set status = 'error', error_code = 'timeout', finished_at = now()
      where id = ${id} and status = 'running' returning *`) as TryonRow[];
    return failed ?? claimed;
  }
  return claimed;
}
