// Runs once when the server starts. Refuses to serve with a dangerous configuration (e.g. fake providers or a
// local base URL in production) instead of running quietly misconfigured. Only names and reasons are logged.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { config } = await import("./server/config");
  config();
}
