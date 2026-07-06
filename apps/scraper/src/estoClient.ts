import { BASE_URL, REQUEST_DELAY_MS } from './config';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestWithRetry(url: string, init: RequestInit, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const text = await res.text();
      await sleep(REQUEST_DELAY_MS);
      return text;
    } catch (err) {
      lastErr = err;
      await sleep(REQUEST_DELAY_MS * (i + 2));
    }
  }
  throw lastErr;
}

/** POST a form to a ColdFusion event and return the HTML body. */
export async function postSearch(event: string, params: Record<string, string | string[]>): Promise<string> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => body.append(key, v));
    else body.append(key, value);
  }
  return requestWithRetry(`${BASE_URL}/index.cfm?event=${event}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
}

/** GET the "Additional Information" popup listing supporting documents for a project. */
export async function getQuadChartInfo(internalId: number): Promise<string> {
  return requestWithRetry(
    `${BASE_URL}/index.cfm?event=ehQuadChart.getQuadChartInfo&ID=${internalId}`,
    { method: 'GET' },
  );
}

export function absoluteUrl(relative: string): string {
  if (/^https?:\/\//i.test(relative)) return relative;
  return `${BASE_URL}/${relative.replace(/^\/+/, '')}`;
}
