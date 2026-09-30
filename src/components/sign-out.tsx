"use client";
import { useRouter } from "next/navigation";
import { authClient } from "@/server/auth/client";
import { Button } from "./ui";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
      }}
    >
      יציאה
    </Button>
  );
}
