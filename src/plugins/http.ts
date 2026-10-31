import { classifyHttp, parseRetryAfter, ProviderError } from "../core/errors.ts";

const TIMEOUT_MS = 20_000;

/** POSTs JSON and returns the parsed reply, or throws a classified ProviderError. */
export async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
  timeoutMs = TIMEOUT_MS,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new ProviderError("temporary", `network error: ${(err as Error).message}`);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new ProviderError(classifyHttp(res.status, text), `HTTP ${res.status}: ${text.slice(0, 300)}`, {
      status: res.status,
      retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
    });
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}
