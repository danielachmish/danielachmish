import { config } from "dotenv";
import fs from "node:fs";
// Integration tests use a dedicated database (.env.test). Fall back to .env.example values for unit tests in CI.
config({ path: fs.existsSync(".env.test") ? ".env.test" : ".env.example", override: true });
process.env.NODE_ENV = "test";
