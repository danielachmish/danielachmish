// Fake providers and dev-only routes must never run in production.
export function fakeAllowed(): boolean {
  return process.env.NODE_ENV !== "production" && (process.env.PROVIDER_MODE ?? "fake") === "fake";
}
export function assertFakeAllowed() {
  if (process.env.NODE_ENV === "production") throw new Error("fake providers are disabled in production");
}
