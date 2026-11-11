// Runs an async step with a time limit, trying again a few times. Phones on a weak signal
// sometimes get no answer at all to one request; without a limit the map waits forever
// ("Loading places… 1,240" that never moves).

/** Rejects with a TimeoutError if `promise` hasn't settled within `ms`. */
export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`No answer after ${ms} ms`);
      err.name = "TimeoutError";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Calls step() up to `tries` times, each time with a `ms` limit, waiting `backoffMs` x the
 * attempt number between tries. Resolves to the first success; rejects with the last error.
 */
export async function retry(step, { tries = 3, ms = 15000, backoffMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await withTimeout(step(), ms);
    } catch (e) {
      lastError = e;
      if (attempt < tries) await new Promise((r) => setTimeout(r, backoffMs * attempt));
    }
  }
  throw lastError;
}
