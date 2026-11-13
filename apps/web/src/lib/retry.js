// Runs an async step with a time limit, trying again a few times. Phones on a weak signal
// sometimes get no answer at all to one request; without a limit the map waits forever
// ("Loading places… 1,240" that never moves). A try that runs out of time is cancelled
// before the next one starts: otherwise its answer kept downloading in the background,
// counting against the database's data allowance, only to be thrown away.

/**
 * Rejects with a TimeoutError if `promise` hasn't settled within `ms`, calling
 * onTimeout() first (to cancel the work behind it).
 */
export function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      const err = new Error(`No answer after ${ms} ms`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Calls step(signal) up to `tries` times, each time with a `ms` limit, waiting `backoffMs` x
 * the attempt number between tries. `signal` is an AbortSignal that fires when that try
 * runs out of time: pass it to the request (supabase-js: .abortSignal(signal)) so a slow
 * answer stops downloading. Resolves to the first success; rejects with the last error.
 * retryIf(error) false stops at once: an error that will be the same every time (a view
 * that doesn't exist) isn't worth two more requests.
 */
export async function retry(
  step,
  { tries = 3, ms = 15000, backoffMs = 1000, retryIf = () => true } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const controller = new AbortController();
      return await withTimeout(step(controller.signal), ms, () => controller.abort());
    } catch (e) {
      lastError = e;
      if (!retryIf(e)) break;
      if (attempt < tries) await new Promise((r) => setTimeout(r, backoffMs * attempt));
    }
  }
  throw lastError;
}
