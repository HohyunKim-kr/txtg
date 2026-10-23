export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Price with the tick's decimals; falls back to significant digits. */
export function fmtPx(px: string | number | undefined | null, decimals?: number): string {
  if (px === undefined || px === null || px === "") return "—";
  const n = Number(px);
  if (!Number.isFinite(n)) return "—";
  const d = decimals ?? (n >= 1000 ? 1 : n >= 1 ? 3 : 6);
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtUsd(v: string | number | undefined | null, d = 2): string {
  if (v === undefined || v === null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtSigned(v: string | number, d = 2): string {
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${fmtUsd(n, d)}`;
}

export function fmtPct(v: number, d = 2): string {
  if (!Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
}

export function fmtCompact(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
}

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient margin/i.test(msg)) return "Insufficient margin";
  if (/rate limit/i.test(msg)) return "Too many requests. Try again shortly";
  if (/rejected|denied|cancel/i.test(msg) && /user/i.test(msg)) return "Signature cancelled";
  return msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
}
