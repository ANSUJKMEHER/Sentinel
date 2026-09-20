import type { SimulatePayload, State } from "./types";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export async function getState(signal?: AbortSignal): Promise<State> {
  const url = API_URL ? `${API_URL}/state` : "/state";
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`GET /state failed: HTTP ${res.status}`);
  return (await res.json()) as State;
}

export async function simulate(payload: SimulatePayload): Promise<{ queued: { ghsa_id: string; source: string } }> {
  const url = API_URL ? `${API_URL}/advisories/simulate` : "/advisories/simulate";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `simulate failed: HTTP ${res.status}`);
  return data;
}
