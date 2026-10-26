import "server-only";

const BASE = "https://yce-api-01.makeupar.com";

export type TaskStatus = "running" | "success" | "error";
export type TaskResult = { status: TaskStatus; resultUrl?: string; error?: string };

export class YouCamError extends Error {
  constructor(
    message: string,
    public httpStatus: number,
    public code?: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isMock = () => process.env.YOUCAM_MODE === "mock" || !process.env.YOUCAM_API_KEY;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const retryNetwork = !init.method || init.method === "GET";
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(BASE + path, {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`,
          "content-type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      if (!retryNetwork || attempt >= 2) throw e;
      await sleep(800 * 2 ** attempt);
      continue;
    }
    if (res.status === 429 && attempt < 2) {
      await sleep(1500 * 2 ** attempt);
      continue;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || (body.status && body.status !== 200)) {
      throw new YouCamError(body.error ?? `HTTP ${res.status}`, res.status, body.error_code);
    }
    return body as T;
  }
}

export async function createClothesTask(srcUrl: string, refUrl: string) {
  if (isMock()) {
    return `mock_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  }
  const body = await call<{ data: { task_id: string } }>("/s2s/v2.0/task/cloth-v4", {
    method: "POST",
    body: JSON.stringify({ src_file_url: srcUrl, ref_file_url: refUrl, garment_category: "auto" }),
  });
  return body.data.task_id;
}

export async function getClothesTask(taskId: string, srcUrl: string): Promise<TaskResult> {
  if (taskId.startsWith("mock_")) {
    const started = Number(taskId.split("_")[1]);
    if (Date.now() - started < 6000) return { status: "running" };
    if (process.env.YOUCAM_MOCK_FAIL) return { status: "error", error: process.env.YOUCAM_MOCK_FAIL };
    return { status: "success", resultUrl: srcUrl };
  }
  const body = await call<{
    data: { task_status: TaskStatus; error?: string | null; results?: { url?: string } };
  }>(`/s2s/v2.0/task/cloth-v4/${encodeURIComponent(taskId)}`);
  return {
    status: body.data.task_status,
    resultUrl: body.data.results?.url,
    error: body.data.error ?? undefined,
  };
}

export async function downloadImage(url: string): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= 2) throw e;
      await sleep(800 * 2 ** attempt);
    }
  }
}
