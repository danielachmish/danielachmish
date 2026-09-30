"use client";
import dynamic from "next/dynamic";

export const BatchEntryClient = dynamic(() => import("./batch-entry").then((m) => m.BatchEntry), {
  ssr: false,
  loading: () => <p>טוען…</p>,
});
