const BASE = "https://yce-api-01.makeupar.com";

export type Feature = "cloth-v4" | "fabric";
export type TaskStatus = "running" | "success" | "error";

export type GarmentCategory =
  | "full_body"
  | "upper_body"
  | "lower_body"
  | "shoes"
  | "outer"
  | "auto";

export type TaskResult = {
  status: TaskStatus;
  resultUrl?: string;
  error?: string;
  errorMessage?: string;
};

export type FabricTemplate = {
  id: string;
  thumb: string;
  title: string;
  category_name: string;
};

export class YouCamError extends Error {
  constructor(
    message: string,
    public httpStatus: number,
    public code?: string,
  ) {
    super(message);
  }
}

export function createClient(apiKey: string) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const retryNetwork = !init.method || init.method === "GET" || path === "/s2s/v2.0/file";
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(BASE + path, {
          ...init,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            ...init.headers,
          },
        });
      } catch (e) {
        if (!retryNetwork || attempt >= 4) throw e;
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 && attempt < 3) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || (body.status && body.status !== 200)) {
        throw new YouCamError(
          body.error ?? `HTTP ${res.status}`,
          res.status,
          body.error_code,
        );
      }
      return body as T;
    }
  }

  async function getCredit(): Promise<number> {
    const body = await call<{ results: { amount_dec: number }[] }>(
      "/s2s/v1.0/client/credit",
    );
    return body.results.reduce((sum, r) => sum + (r.amount_dec ?? 0), 0);
  }

  async function uploadFile(
    bytes: Uint8Array,
    fileName: string,
    contentType = "image/jpeg",
  ): Promise<string> {
    const body = await call<{
      data: {
        files: {
          file_id: string;
          requests: { url: string; method: string; headers: Record<string, string> }[];
        }[];
      };
    }>("/s2s/v2.0/file", {
      method: "POST",
      body: JSON.stringify({
        files: [{ content_type: contentType, file_name: fileName, file_size: bytes.byteLength }],
      }),
    });
    const file = body.data.files[0];
    const req = file.requests[0];
    for (let attempt = 0; ; attempt++) {
      try {
        const put = await fetch(req.url, {
          method: req.method ?? "PUT",
          headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.toLowerCase() !== "content-length")),
          body: new Blob([new Uint8Array(bytes)]),
        });
        if (!put.ok) throw new YouCamError(`Upload PUT failed: ${put.status}`, put.status);
        break;
      } catch (e) {
        if (e instanceof YouCamError || attempt >= 3) throw e;
        await sleep(1500 * 2 ** attempt);
      }
    }
    return file.file_id;
  }

  async function createTask(feature: Feature, params: Record<string, unknown>) {
    const body = await call<{ data: { task_id: string } }>(`/s2s/v2.0/task/${feature}`, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return body.data.task_id;
  }

  async function getTask(feature: Feature, taskId: string): Promise<TaskResult> {
    const body = await call<{
      data: {
        task_status: TaskStatus;
        error?: string | null;
        error_message?: string;
        results?: { url?: string };
      };
    }>(`/s2s/v2.0/task/${feature}/${encodeURIComponent(taskId)}`);
    return {
      status: body.data.task_status,
      resultUrl: body.data.results?.url,
      error: body.data.error ?? undefined,
      errorMessage: body.data.error_message,
    };
  }

  async function waitForTask(
    feature: Feature,
    taskId: string,
    { intervalMs = 3000, timeoutMs = 180_000 } = {},
  ): Promise<TaskResult & { polls: number }> {
    const started = Date.now();
    let polls = 0;
    let delay = intervalMs;
    while (Date.now() - started < timeoutMs) {
      await sleep(delay);
      polls++;
      const result = await getTask(feature, taskId);
      if (result.status !== "running") return { ...result, polls };
      delay = Math.min(delay * 1.2, 8000);
    }
    return { status: "error", error: "client_timeout", polls };
  }

  async function listFabricTemplates(): Promise<FabricTemplate[]> {
    const all: FabricTemplate[] = [];
    let token: string | undefined;
    do {
      const qs = new URLSearchParams({ page_size: "20" });
      if (token) qs.set("starting_token", token);
      const body = await call<{ data: { templates: FabricTemplate[]; next_token?: string } }>(
        `/s2s/v2.0/task/template/fabric?${qs}`,
      );
      all.push(...body.data.templates);
      token = body.data.next_token || undefined;
    } while (token && all.length < 200);
    return all;
  }

  return { getCredit, uploadFile, createTask, getTask, waitForTask, listFabricTemplates };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function download(url: string, attempts = 4): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt >= attempts - 1) throw e;
      await sleep(1500 * 2 ** attempt);
    }
  }
}
