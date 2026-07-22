import { defaultHttpClient } from "./http-client.js";

const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "refine-cv-job-scan/0.1 (+https://github.com/refine-cv)",
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await defaultHttpClient.fetch(url, { headers: DEFAULT_HEADERS });
  return (await response.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const response = await defaultHttpClient.fetch(url, {
    headers: { ...DEFAULT_HEADERS, Accept: "text/html,application/xhtml+xml" },
  });
  return response.text();
}
