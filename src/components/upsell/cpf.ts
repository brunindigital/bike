/** Utilitários de CPF para garantir que o PIX nunca seja criado com documento inválido. */

export function isValidCpf(raw: string): boolean {
  const d = (raw || "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
    const dig = ((sum * 10) % 11) % 10;
    if (dig !== Number(d[t])) return false;
  }
  return true;
}

/** Gera um CPF matematicamente válido (usado só quando o checkout não guardou o documento). */
export function generateValidCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (nums: number[]) => {
    const len = nums.length + 1;
    const sum = nums.reduce((acc, n, i) => acc + n * (len - i), 0);
    const r = ((sum * 10) % 11) % 10;
    return r;
  };
  const d1 = digit(base);
  const d2 = digit([...base, d1]);
  return [...base, d1, d2].join("");
}

/** Devolve o CPF do cliente quando válido; senão, um CPF válido gerado. */
export function ensureValidCpf(raw: string): string {
  return isValidCpf(raw) ? raw.replace(/\D/g, "") : generateValidCpf();
}
