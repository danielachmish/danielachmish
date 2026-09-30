import { isProductionEnv } from "../env";

// Fake providers and dev-only routes never run in production (they do run locally and on the demo site).
export function fakeAllowed(): boolean {
  return !isProductionEnv() && (process.env.PROVIDER_MODE ?? "fake") === "fake";
}
export function assertFakeAllowed() {
  if (isProductionEnv()) throw new Error("fake providers are disabled in production");
}
