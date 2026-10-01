// Consistent phone identity: E.164. Israeli local formats are normalised to +972.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{8,9}$/.test(s)) s = "+972" + s.slice(1);
  if (/^972\d{8,9}$/.test(s)) s = "+" + s;
  if (!/^\+\d{9,15}$/.test(s)) return null;
  return s;
}

export function maskPhone(p: string): string {
  return p.length > 4 ? `${"•".repeat(Math.max(0, p.length - 4))}${p.slice(-4)}` : p;
}

/** Local display / export format: +972501234567 → 050-1234567. Other countries stay E.164. */
export function displayPhone(p: string | null | undefined): string {
  if (!p) return "";
  const m = /^\+972(\d{1,2})(\d{7})$/.exec(p);
  return m ? `0${m[1]}-${m[2]}` : p;
}

/** d•••••@gmail.com – enough for the owner to recognise, nothing for anyone else. */
export function maskEmail(e: string): string {
  const [user, domain] = e.split("@");
  if (!user || !domain) return "•••";
  return `${user[0]}${"•".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}
