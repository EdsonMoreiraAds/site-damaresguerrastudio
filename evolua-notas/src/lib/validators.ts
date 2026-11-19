export const onlyDigits = (s: string) => s.replace(/\D/g, "");

function check(digits: string, weights: number[]) {
  const sum = weights.reduce((acc, w, i) => acc + Number(digits[i]) * w, 0);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

export function isValidCnpj(input: string): boolean {
  const c = onlyDigits(input);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const d1 = check(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = check(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[12]) && d2 === Number(c[13]);
}

export function isValidCpf(input: string): boolean {
  const c = onlyDigits(input);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const d1 = check(c, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = check(c, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(c[9]) && d2 === Number(c[10]);
}

export const isValidTomadorDoc = (s: string) => isValidCpf(s) || isValidCnpj(s);

export function formatDoc(d: string): string {
  const c = onlyDigits(d);
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return d;
}

/** "1.234,56" ou "1234.56" -> 1234.56 (ou null). */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 100_000_000 ? n : null;
}
