import { execSync } from "node:child_process";

export default function setup() {
  if (process.env.NODE_ENV === "production") throw new Error("e2e must not run against production");
  execSync("npx tsx scripts/reset-db.ts && npx tsx prisma/seed.ts", { stdio: "inherit" });
}
