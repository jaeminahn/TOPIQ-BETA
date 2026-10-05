export const GOOGLE_GENERATION_REQUEST_COOLDOWN_MS = 180_000;

type RequestQueue = { tail: Promise<void>; nextRequestAt: number };
const queues = new Map<string, RequestQueue>();
const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Share one request queue per project/model in this server process. */
export async function withGoogleGenerationRequest<T>(
  projectId: string,
  model: string,
  request: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([projectId, model]);
  let queue = queues.get(key);
  if (!queue) {
    queue = { tail: Promise.resolve(), nextRequestAt: 0 };
    queues.set(key, queue);
  }
  const current = queue;
  const result = current.tail.then(async () => {
    let remaining = current.nextRequestAt - Date.now();
    while (remaining > 0) {
      await wait(Math.min(remaining, 30_000));
      remaining = current.nextRequestAt - Date.now();
    }
    try {
      return await request();
    } finally {
      // Includes failed requests and response parsing; never retry here.
      current.nextRequestAt = Date.now() + GOOGLE_GENERATION_REQUEST_COOLDOWN_MS;
    }
  });
  // A provider failure reaches its caller without blocking subsequent requests.
  current.tail = result.then(() => undefined, () => undefined);
  return result;
}
