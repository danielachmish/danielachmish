import "dotenv/config";
import { bootstrapAdmin } from "../src/server/admin/bootstrap";
import { prisma } from "../src/server/db/client";

// Build step (production): make sure the owner's admin account exists. Never fails the build on e-mail problems.
async function main() {
  const email = process.env.ADMIN_EMAIL;
  if (!email) return console.log("ADMIN_EMAIL not set – skipping admin bootstrap");
  try {
    const r = await bootstrapAdmin(email);
    console.log(
      r === "unchanged"
        ? "✓ admin account exists"
        : r.endsWith("-no-email")
          ? `✓ admin account ${r.replace("-no-email", "")}; e-mail is not configured yet (RESEND_API_KEY, EMAIL_FROM) – then use /forgot-password`
          : `✓ admin account ${r}; a link to choose a password was e-mailed`,
    );
  } catch (e) {
    console.warn(`! admin bootstrap: ${(e as Error).message.slice(0, 200)} – use /forgot-password once e-mail works`);
  } finally {
    await prisma.$disconnect();
  }
}
main().then(() => process.exit(0));
