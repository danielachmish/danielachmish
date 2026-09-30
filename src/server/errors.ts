// Domain errors carry a stable code (for tests / API) and a Hebrew message for the user.
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}

export const notFound = (what = "הרשומה") => new DomainError("not_found", `${what} לא נמצאה או שאין לך הרשאה לצפות בה.`, 404);
export const forbidden = () => new DomainError("forbidden", "אין לך הרשאה לבצע פעולה זו.", 403);

export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; meta?: { driverAdapterError?: { cause?: { kind?: string } } } };
  return (
    err?.code === "P2002" ||
    err?.code === "23505" ||
    err?.cause?.code === "23505" ||
    err?.meta?.driverAdapterError?.cause?.kind === "UniqueConstraintViolation"
  );
}
