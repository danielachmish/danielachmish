import { prisma } from "../db/client";
import type { Prisma } from "@/generated/prisma/client";
import { assertFakeAllowed } from "./guard";

// Shared state for fake providers (web + worker). Development/test only.
export async function fakePut(kind: string, key: string, data: Prisma.InputJsonValue) {
  assertFakeAllowed();
  return prisma.devFakeRecord.upsert({ where: { kind_key: { kind, key } }, create: { kind, key, data }, update: { data } });
}
export async function fakeGet<T>(kind: string, key: string): Promise<T | null> {
  assertFakeAllowed();
  const r = await prisma.devFakeRecord.findUnique({ where: { kind_key: { kind, key } } });
  return (r?.data as T) ?? null;
}
export async function fakeList<T>(kind: string, take = 100): Promise<(T & { _key: string; _at: Date })[]> {
  assertFakeAllowed();
  const rows = await prisma.devFakeRecord.findMany({ where: { kind }, orderBy: { createdAt: "desc" }, take });
  return rows.map((r) => ({ ...(r.data as T), _key: r.key, _at: r.createdAt }));
}
