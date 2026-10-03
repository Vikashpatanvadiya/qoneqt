export type CreateBody = {
  input_type: string;
  inputs: string[];
  community_id?: string | null;
  options?: Record<string, unknown>;
};

export type CreateResult = { batch_id: string | null; jobs: Array<{ id: string; status: string; error?: string }> };

export async function createJobs(body: CreateBody): Promise<CreateResult> {
  const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as CreateResult;
}
