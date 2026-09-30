import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto max-w-sm space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">כניסת גבאי</h1>
      <LoginForm notice={e === "no_membership" ? "החשבון אינו משויך לבית כנסת פעיל. פנו לצוות השירות." : undefined} />
    </main>
  );
}
