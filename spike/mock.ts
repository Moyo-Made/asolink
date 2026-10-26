import { sleep, type createClient } from "./youcam.ts";

export function createMockClient(): ReturnType<typeof createClient> {
  let credit = 1040;
  const files = new Map<string, Uint8Array>();
  const tasks = new Map<string, { src: string; fail: boolean }>();
  return {
    async getCredit() {
      return credit;
    },
    async uploadFile(bytes, name) {
      files.set(name, bytes);
      return name;
    },
    async createTask(_feature, params) {
      const id = `task_${tasks.size}`;
      credit -= 2;
      tasks.set(id, { src: String(params.src_file_id), fail: String(params.ref_file_id ?? "").includes("fabric") });
      return id;
    },
    async getTask(_feature, taskId) {
      const t = tasks.get(taskId)!;
      return t.fail ? { status: "error", error: "error_invalid_ref" } : { status: "success", resultUrl: `data:image/jpeg;base64,${Buffer.from(files.get(t.src)!).toString("base64")}` };
    },
    async waitForTask(feature, taskId) {
      await sleep(200);
      return { ...(await this.getTask(feature, taskId)), polls: 1 };
    },
    async listFabricTemplates() {
      return [{ id: "mock_template_001", thumb: "", title: "Mock", category_name: "mock" }];
    },
  };
}
