import type { Address } from "viem";
import type { TxFlow, Trader } from "./client";
import { marketPrice, roundSize } from "./format";
import { PendingExchangeError } from "./http";
import type { PerpMarket, Position } from "./info";

export function matchesPosition(a: Position, b: Position): boolean {
  return Number(a.asset) === Number(b.asset) && a.leverage.type.toLowerCase() === b.leverage.type.toLowerCase()
    && Math.sign(Number(a.szi)) === Math.sign(Number(b.szi));
}

/** A close never depends on cached ticker/mark prices or an old position size. */
export async function closePosition(tx: TxFlow, user: Address, trader: Trader, market: PerpMarket, position: Position, fraction = 1) {
  if (!(fraction > 0 && fraction <= 1)) throw new Error("Invalid close percentage");
  const [account, book] = await Promise.all([tx.info.clearinghouseState(user), tx.info.l2Book(market.index)]);
  const current = account.assetPositions.map((p) => p.position).find((p) => matchesPosition(p, position));
  if (!current || Number(current.szi) === 0) return { status: "closed" as const, remaining: "0" };
  const isBuy = Number(current.szi) < 0;
  const price = Number(book.levels[isBuy ? 1 : 0][0]?.px);
  if (!(price > 0 && Number.isFinite(price))) throw new Error("No executable liquidity. Try a limit close.");
  const size = roundSize(Math.abs(Number(current.szi)) * fraction, market.szDecimals);
  if (!(Number(size) > 0)) throw new Error("Close size is below the market minimum");
  if (Number(size) > market.maxMarketOrderSize) throw new Error(`Close at most ${market.maxMarketOrderSize} ${market.baseCurrency} per order. Choose a smaller percentage.`);
  try {
    await trader.order([{ asset: market.index, isBuy, price: marketPrice(price, isBuy, market.priceTick), size,
      reduceOnly: true, tif: "FrontendMarket", marginMode: current.leverage.type.toLowerCase() === "isolated" ? "isolated" : "cross" }]);
  } catch (error) {
    if (!(error instanceof PendingExchangeError)) throw error;
  }
  const target = Math.abs(Number(current.szi)) - Number(size);
  for (let i = 0; i < 12; i++) {
    const state = await tx.info.clearinghouseState(user);
    const p = state.assetPositions.map((x) => x.position).find((x) => matchesPosition(x, current));
    const remaining = Math.abs(Number(p?.szi ?? 0));
    if (remaining <= target + 10 ** (-market.szDecimals - 1)) {
      return { status: remaining === 0 ? "closed" as const : "reduced" as const, remaining: String(remaining) };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { status: "pending" as const, remaining: current.szi };
}
