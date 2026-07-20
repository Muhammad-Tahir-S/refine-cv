import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpRequestError,
  computeBackoffDelayMs,
  createHttpClient,
  DEFAULT_HTTP_CLIENT_CONFIG,
  isRetryableHttpStatus,
  parseRetryAfterMs,
} from "../../src/lib/jobs/http-client.ts";

function makeResponse(
  status: number,
  init: { headers?: Record<string, string> } = {},
): Response {
  return new Response("", {
    status,
    headers: init.headers,
  });
}

describe("http-client policy", () => {
  it("classifies retryable HTTP statuses", () => {
    expect(isRetryableHttpStatus(408)).toBe(true);
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(401)).toBe(false);
  });

  it("parses Retry-After delta seconds and HTTP-date", () => {
    const now = new Date("2026-07-20T10:00:00.000Z");
    expect(parseRetryAfterMs("30", now)).toBe(30_000);
    expect(parseRetryAfterMs("2026-07-20T10:01:00.000Z", now)).toBe(60_000);
    expect(parseRetryAfterMs("not-a-date", now)).toBeNull();
  });

  it("keeps backoff within configured bounds", () => {
    const config = { ...DEFAULT_HTTP_CLIENT_CONFIG, maxDelayMs: 1_000 };
    const delay = computeBackoffDelayMs(5, config, () => 1);
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(1_000);
  });
});

describe("http-client retries", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts hung requests via timeout", async () => {
    vi.useFakeTimers();
    const client = createHttpClient({
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        }),
      sleep: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
      random: () => 0.5,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, timeoutMs: 50, maxRetries: 0 });

    const pending = client.fetch("https://example.com/jobs");
    const assertion = expect(pending).rejects.toMatchObject({
      name: "HttpRequestError",
      url: "https://example.com/jobs",
      retryable: true,
      attempts: 1,
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("retries an internal timeout within the bounded policy", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const client = createHttpClient({
      fetch: (_url, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        });
      },
      sleep: async () => undefined,
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, timeoutMs: 50, maxRetries: 1 });

    const pending = client.fetch("https://example.com/jobs");
    const assertion = expect(pending).rejects.toMatchObject({
      name: "HttpRequestError",
      retryable: true,
      attempts: 2,
      cancelled: false,
    });
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(calls).toBe(2);
  });

  it("treats caller cancellation as prompt and non-retryable", async () => {
    const controller = new AbortController();
    let calls = 0;
    const sleeps: number[] = [];
    const client = createHttpClient({
      fetch: (_url, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        });
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, maxRetries: 3 });

    const pending = client.fetch("https://example.com/jobs", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      name: "HttpRequestError",
      retryable: false,
      cancelled: true,
      attempts: 1,
    });
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it("removes caller abort listeners after a completed attempt", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const client = createHttpClient({
      fetch: async () => makeResponse(200),
      sleep: async () => undefined,
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    });

    await client.fetch("https://example.com/jobs", {
      signal: controller.signal,
    });

    expect(addListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("retries transient 503 responses with bounded attempts", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = createHttpClient({
      fetch: async () => {
        calls += 1;
        return makeResponse(503);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, maxRetries: 2, baseDelayMs: 100, maxDelayMs: 100 });

    await expect(client.fetch("https://example.com/jobs")).rejects.toMatchObject({
      name: "HttpRequestError",
      status: 503,
      attempts: 3,
      retryable: true,
    });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([50, 50]);
  });

  it("does not retry permanent 404 responses", async () => {
    let calls = 0;
    const client = createHttpClient({
      fetch: async () => {
        calls += 1;
        return makeResponse(404);
      },
      sleep: async () => undefined,
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    });

    await expect(client.fetch("https://example.com/jobs")).rejects.toMatchObject({
      name: "HttpRequestError",
      status: 404,
      attempts: 1,
      retryable: false,
    });
    expect(calls).toBe(1);
  });

  it("honors Retry-After seconds when under cap", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const client = createHttpClient({
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          return makeResponse(429, { headers: { "Retry-After": "2" } });
        }
        return makeResponse(200);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, maxRetries: 1, maxRetryAfterMs: 10_000 });

    const response = await client.fetch("https://example.com/jobs");
    expect(response.status).toBe(200);
    expect(sleeps).toEqual([2_000]);
  });

  it("cancels a retryable response body before the next attempt", async () => {
    let calls = 0;
    let cancelled = false;
    const client = createHttpClient({
      fetch: async () => {
        calls += 1;
        if (calls === 1) {
          const body = new ReadableStream({
            cancel: () => {
              cancelled = true;
            },
          });
          return new Response(body, { status: 503 });
        }
        return makeResponse(200);
      },
      sleep: async () => undefined,
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, maxRetries: 1 });

    await expect(client.fetch("https://example.com/jobs")).resolves.toMatchObject({
      status: 200,
    });
    expect(cancelled).toBe(true);
    expect(calls).toBe(2);
  });

  it("fails fast when Retry-After exceeds cap with metadata", async () => {
    const client = createHttpClient({
      fetch: async () => makeResponse(429, { headers: { "Retry-After": "120" } }),
      sleep: async () => undefined,
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, maxRetries: 2, maxRetryAfterMs: 5_000 });

    await expect(client.fetch("https://example.com/jobs")).rejects.toEqual(
      expect.objectContaining({
        name: "HttpRequestError",
        retryAfterMs: 120_000,
        retryAfterCapMs: 5_000,
        attempts: 1,
      }),
    );
  });

  it("does not expose response bodies in errors", async () => {
    const client = createHttpClient({
      fetch: async () => new Response("secret-body", { status: 500 }),
      sleep: async () => undefined,
      random: () => 0,
      now: () => new Date("2026-07-20T10:00:00.000Z"),
    }, { ...DEFAULT_HTTP_CLIENT_CONFIG, maxRetries: 0 });

    try {
      await client.fetch("https://example.com/jobs");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpRequestError);
      expect(String(error)).not.toContain("secret-body");
    }
  });
});
