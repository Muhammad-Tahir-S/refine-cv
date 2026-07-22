export interface HttpClientDependencies {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  /** Returns a float in [0, 1). */
  random: () => number;
  now: () => Date;
}

export interface HttpClientConfig {
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Upper bound for honoring Retry-After; exceeding values fail fast with metadata. */
  maxRetryAfterMs: number;
}

export interface ResilientRequestInit extends RequestInit {
  timeoutMs?: number;
  maxRetries?: number;
}

export interface HttpRequestErrorMetadata {
  url: string;
  status?: number;
  attempts: number;
  retryable: boolean;
  cancelled?: boolean;
  retryAfterMs?: number;
  retryAfterCapMs?: number;
}

export class HttpRequestError extends Error {
  readonly url: string;
  readonly status?: number;
  readonly attempts: number;
  readonly retryable: boolean;
  readonly cancelled: boolean;
  readonly retryAfterMs?: number;
  readonly retryAfterCapMs?: number;

  constructor(message: string, metadata: HttpRequestErrorMetadata, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HttpRequestError";
    this.url = metadata.url;
    this.status = metadata.status;
    this.attempts = metadata.attempts;
    this.retryable = metadata.retryable;
    this.cancelled = metadata.cancelled ?? false;
    this.retryAfterMs = metadata.retryAfterMs;
    this.retryAfterCapMs = metadata.retryAfterCapMs;
  }
}

export const DEFAULT_HTTP_CLIENT_CONFIG: HttpClientConfig = {
  timeoutMs: 30_000,
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  maxRetryAfterMs: 60_000,
};

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

export function parseRetryAfterMs(
  headerValue: string | null,
  now: Date,
): number | null {
  if (!headerValue) {
    return null;
  }

  const trimmed = headerValue.trim();
  if (!trimmed) {
    return null;
  }

  const deltaSeconds = Number(trimmed);
  if (!Number.isNaN(deltaSeconds) && deltaSeconds >= 0) {
    return Math.round(deltaSeconds * 1000);
  }

  const retryAt = Date.parse(trimmed);
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, retryAt - now.getTime());
  }

  return null;
}

export function computeBackoffDelayMs(
  attempt: number,
  config: HttpClientConfig,
  random: () => number,
): number {
  const exponential = config.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, config.maxDelayMs);
  const jitter = capped * (0.5 + random() * 0.5);
  return Math.round(jitter);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

class RequestTimeoutError extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super("Request timed out", options);
    this.name = "RequestTimeoutError";
  }
}

class RequestCancelledError extends Error {
  constructor(options: { cause?: unknown } = {}) {
    super("Request cancelled by caller", options);
    this.name = "RequestCancelledError";
  }
}

function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND"
  );
}

function mergeAbortSignals(
  signals: AbortSignal[],
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const listeners: Array<{ signal: AbortSignal; listener: () => void }> = [];

  const abort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      abort();
      break;
    }
    const listener = () => abort();
    signal.addEventListener("abort", listener);
    listeners.push({ signal, listener });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const { signal, listener } of listeners) {
        signal.removeEventListener("abort", listener);
      }
    },
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  deps: HttpClientDependencies,
): Promise<Response> {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);
  const merged = init.signal
    ? mergeAbortSignals([init.signal, timeoutController.signal])
    : { signal: timeoutController.signal, cleanup: () => undefined };

  try {
    return await deps.fetch(url, { ...init, signal: merged.signal });
  } catch (error) {
    if (init.signal?.aborted) {
      throw new RequestCancelledError({ cause: error });
    }
    if (timedOut && isAbortError(error)) {
      throw new RequestTimeoutError({ cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    merged.cleanup();
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Cleanup must not hide the actionable HTTP failure.
  }
}

async function sleepWithSignal(
  ms: number,
  sleep: (delayMs: number) => Promise<void>,
  signal: AbortSignal | null | undefined,
): Promise<void> {
  if (!signal) {
    await sleep(ms);
    return;
  }
  if (signal.aborted) {
    throw new RequestCancelledError();
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new RequestCancelledError());
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort);
    sleep(ms).then(
      () => {
        cleanup();
        resolve();
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export interface HttpClient {
  fetch(url: string, init?: ResilientRequestInit): Promise<Response>;
}

export function createHttpClient(
  deps: HttpClientDependencies,
  config: HttpClientConfig = DEFAULT_HTTP_CLIENT_CONFIG,
): HttpClient {
  return {
    async fetch(url: string, init: ResilientRequestInit = {}): Promise<Response> {
      const timeoutMs = init.timeoutMs ?? config.timeoutMs;
      const maxRetries = init.maxRetries ?? config.maxRetries;
      const maxAttempts = maxRetries + 1;

      let lastError: unknown;
      let lastStatus: number | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (init.signal?.aborted) {
          throw new HttpRequestError(
            `Request cancelled by caller for ${url}`,
            {
              url,
              attempts: attempt,
              retryable: false,
              cancelled: true,
            },
          );
        }

        try {
          const {
            timeoutMs: _timeoutMs,
            maxRetries: _maxRetries,
            ...requestInit
          } = init;
          const response = await fetchWithTimeout(
            url,
            requestInit,
            timeoutMs,
            deps,
          );

          if (response.ok) {
            return response;
          }

          lastStatus = response.status;
          const retryable = isRetryableHttpStatus(response.status);
          const retryAfterMs = parseRetryAfterMs(
            response.headers.get("Retry-After"),
            deps.now(),
          );
          await cancelResponseBody(response);

          if (!retryable || attempt >= maxAttempts) {
            throw new HttpRequestError(
              `HTTP ${response.status} for ${url}`,
              {
                url,
                status: response.status,
                attempts: attempt,
                retryable,
                retryAfterMs: retryAfterMs ?? undefined,
              },
            );
          }

          if (retryAfterMs !== null && retryAfterMs > config.maxRetryAfterMs) {
            throw new HttpRequestError(
              `HTTP ${response.status} for ${url}; Retry-After ${retryAfterMs}ms exceeds cap ${config.maxRetryAfterMs}ms`,
              {
                url,
                status: response.status,
                attempts: attempt,
                retryable: true,
                retryAfterMs,
                retryAfterCapMs: config.maxRetryAfterMs,
              },
            );
          }

          const delayMs =
            retryAfterMs ?? computeBackoffDelayMs(attempt, config, deps.random);
          await sleepWithSignal(delayMs, deps.sleep, init.signal);
        } catch (error) {
          if (error instanceof HttpRequestError) {
            throw error;
          }

          lastError = error;
          if (error instanceof RequestCancelledError) {
            throw new HttpRequestError(
              `Request cancelled by caller for ${url}`,
              {
                url,
                status: lastStatus,
                attempts: attempt,
                retryable: false,
                cancelled: true,
              },
              { cause: error },
            );
          }

          const timedOut = error instanceof RequestTimeoutError;
          const retryable = timedOut || isTransientNetworkError(error);
          if (!retryable || attempt >= maxAttempts) {
            const message = timedOut
              ? `Request timed out after ${timeoutMs}ms for ${url}`
              : `Network error for ${url}`;
            throw new HttpRequestError(
              message,
              {
                url,
                status: lastStatus,
                attempts: attempt,
                retryable,
              },
              { cause: error },
            );
          }

          try {
            await sleepWithSignal(
              computeBackoffDelayMs(attempt, config, deps.random),
              deps.sleep,
              init.signal,
            );
          } catch (sleepError) {
            if (sleepError instanceof RequestCancelledError) {
              throw new HttpRequestError(
                `Request cancelled by caller for ${url}`,
                {
                  url,
                  status: lastStatus,
                  attempts: attempt,
                  retryable: false,
                  cancelled: true,
                },
                { cause: sleepError },
              );
            }
            throw sleepError;
          }
        }
      }

      throw new HttpRequestError(
        `Request failed for ${url}`,
        {
          url,
          status: lastStatus,
          attempts: maxAttempts,
          retryable: false,
        },
        { cause: lastError },
      );
    },
  };
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const defaultHttpClient = createHttpClient({
  fetch: globalThis.fetch.bind(globalThis),
  sleep: defaultSleep,
  random: Math.random,
  now: () => new Date(),
});
