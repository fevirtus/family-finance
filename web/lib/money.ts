const MULTIPLIER: Record<string, number> = {
  k: 1_000,
  "nghìn": 1_000,
  tr: 1_000_000,
  "triệu": 1_000_000,
  m: 1_000_000,
};

/** Parse Vietnamese money input ("45k", "1tr2", "1.200.000đ") into a positive VND integer. */
export function parseVnd(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/(vnđ|vnd|đ)$/u, "");
  if (!s) return null;

  let m = s.match(/^(\d+)(tr|triệu|m)(\d{1,3})$/u);
  if (m) return Number(m[1]) * 1_000_000 + Number(m[3].padEnd(3, "0")) * 1_000;

  m = s.match(/^(\d+(?:[.,]\d+)?)(k|nghìn|tr|triệu|m)$/u);
  if (m) return Math.round(Number(m[1].replace(",", ".")) * MULTIPLIER[m[2]]);

  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ""));
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

const vndFormatter = new Intl.NumberFormat("vi-VN");

export function formatVnd(amount: number): string {
  return `${vndFormatter.format(amount)} đ`;
}

/** Compact VND label for charts and chips: 45k, 4,2tr, 500đ. */
export function shortVnd(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 999_500) {
    const tenths = Math.round(abs / 100_000);
    const text =
      tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)},${tenths % 10}`;
    return `${sign}${text}tr`;
  }
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k`;
  return `${sign}${abs}đ`;
}
