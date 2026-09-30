import { execSync } from "node:child_process";
import { config } from "dotenv";
import fs from "node:fs";

export default function setup() {
  config({ path: fs.existsSync(".env.test") ? ".env.test" : ".env.example", override: true });
  if (!/_test\b|_test$/.test(process.env.DATABASE_URL ?? "")) throw new Error("integration tests must run against a *_test database");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
