/**
 * Next.js instrumentation hook — runs once when the server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only start the worker on the Node.js server, not in Edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("@dealy/domain");
    startWorker();
  }
}
