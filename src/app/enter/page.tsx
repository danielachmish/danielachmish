import { notFound } from "next/navigation";
import { loginSettings } from "@/server/auth/login-settings";
import { EnterForm } from "./enter-form";

// Phone + code entrance. Hidden until the platform owner turns it on in the admin station – read on every
// request (never prerendered at build), so the admin's switch applies immediately.
export const dynamic = "force-dynamic";

export default async function EnterPage() {
  if (!(await loginSettings()).phoneLogin) notFound();
  return <EnterForm />;
}
