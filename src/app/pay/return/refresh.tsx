"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const t = setInterval(() => (++n > 24 ? clearInterval(t) : router.refresh()), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
