"use client";
import dynamic from "next/dynamic";

// The link token lives in the URL fragment, which only exists in the browser – render client-only.
const Landing = dynamic(() => import("./landing"), { ssr: false, loading: () => <p className="p-8">טוען…</p> });

export default function Page() {
  return <Landing />;
}
