import { authHeader } from "./auth";

export type CreateBody = {
  input_type: string;
  inputs: string[];
  community_id?: string | null;
  options?: Record<string, unknown>;
};

export type CreateResult = { batch_id: string | null; jobs: Array<{ id: string; status: string; error?: string }> };

export class ApiError extends Error {
  constructor(
    message: string,
    public needLogin = false,
  ) {
    super(message);
  }
}

export async function createJobs(body: CreateBody): Promise<CreateResult> {
  const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, Boolean(data.needLogin));
  return data as CreateResult;
}

export async function deleteJob(id: string): Promise<void> {
  const res = await fetch(`/api/jobs?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: await authHeader() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Delete failed (${res.status})`, Boolean(data.needLogin));
}
