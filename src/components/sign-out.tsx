"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/server/auth/client";
import { Button } from "./ui";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
      }}
    >
      <LogOut className="size-4" aria-hidden />
      יציאה
    </Button>
  );
}
