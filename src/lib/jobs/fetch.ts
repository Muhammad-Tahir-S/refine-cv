const DEFAULT_HEADERS = {
  Accept: "application/json",
  "User-Agent": "refine-cv-job-scan/0.1 (+https://github.com/refine-cv)",
};

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, Accept: "text/html,application/xhtml+xml" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}
