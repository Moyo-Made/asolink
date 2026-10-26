export const naira = (n: number | null | undefined) =>
  n == null ? null : `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  const end = new Date(`${iso.slice(0, 10)}T23:59:59`).getTime();
  return Math.ceil((end - Date.now()) / 86_400_000);
}

export function normalizeWhatsapp(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}
