import type { SimulatePayload, State } from "./types";

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export async function getState(signal?: AbortSignal): Promise<State> {
  if (!API_URL) throw new Error("VITE_API_URL is not configured");
  const res = await fetch(`${API_URL}/state`, { signal });
  if (!res.ok) throw new Error(`GET /state failed: HTTP ${res.status}`);
  return (await res.json()) as State;
}

export async function simulate(payload: SimulatePayload): Promise<{ queued: { ghsa_id: string; source: string } }> {
  if (!API_URL) throw new Error("VITE_API_URL is not configured");
  const res = await fetch(`${API_URL}/advisories/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `simulate failed: HTTP ${res.status}`);
  return data;
}
