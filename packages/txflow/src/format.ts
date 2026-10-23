export function decimalsOf(step: string): number {
  const i = step.indexOf(".");
  return i < 0 ? 0 : step.length - i - 1;
}

type Rounding = "down" | "up" | "nearest";

function roundInt(x: number, step: number, mode: Rounding): number {
  const q = x / step;
  const n = mode === "down" ? Math.floor(q + 1e-9) : mode === "up" ? Math.ceil(q - 1e-9) : Math.round(q);
  return n * step;
}

/** Round a price onto the instrument's `priceTick`, formatted with the tick's decimals. */
export function roundPrice(price: number | string, priceTick: string, mode: Rounding = "nearest"): string {
  const d = decimalsOf(priceTick);
  const scale = 10 ** d;
  const tickInt = Math.round(Number(priceTick) * scale);
  const pxInt = roundInt(Math.round(Number(price) * scale * 1e3) / 1e3, tickInt, mode);
  return (pxInt / scale).toFixed(d);
}

/** Truncate a size to `szDecimals`. Returns `"0"`-like strings for dust. */
export function roundSize(size: number | string, szDecimals: number): string {
  const scale = 10 ** szDecimals;
  const n = Math.floor(Number(size) * scale + 1e-9);
  return (n / scale).toFixed(szDecimals);
}

/** Price for an aggressive (market) order: mid ± slippage, rounded away from the book. */
export function marketPrice(mid: number, isBuy: boolean, priceTick: string, slippage = 0.01): string {
  return roundPrice(mid * (isBuy ? 1 + slippage : 1 - slippage), priceTick, isBuy ? "up" : "down");
}
