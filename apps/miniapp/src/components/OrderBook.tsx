import { decimalsOf, type BookLevel, type L2Book, type PerpMarket } from "@txgram/txflow";
import { fmtPx } from "../lib/format";

const ROWS = 9;

export function OrderBook({
  market,
  book,
  onPick,
}: {
  market: PerpMarket;
  book: L2Book | undefined;
  onPick(px: string): void;
}) {
  const d = decimalsOf(market.priceTick);
  const bids = book?.levels[0].slice(0, ROWS) ?? [];
  const asks = book?.levels[1].slice(0, ROWS) ?? [];
  const max = Math.max(...bids.map((l) => Number(l.sz)), ...asks.map((l) => Number(l.sz)), 1e-12);
  const bestBid = Number(bids[0]?.px);
  const bestAsk = Number(asks[0]?.px);
  const spread = bestAsk - bestBid;

  const row = (l: BookLevel | undefined, side: "bid" | "ask", i: number) => (
    <button
      key={`${side}${i}`}
      disabled={!l}
      onClick={() => l && onPick(l.px)}
      className="relative flex h-[22px] w-full items-center justify-between px-2 text-[11px] active:bg-surface"
    >
      {l && (
        <span
          className={`absolute inset-y-0.5 right-0 ${side === "bid" ? "bg-buy/12" : "bg-sell/12"}`}
          style={{ width: `${(Number(l.sz) / max) * 100}%` }}
        />
      )}
      <span className={`num relative ${side === "bid" ? "text-buy" : "text-sell"}`}>{l ? fmtPx(l.px, d) : ""}</span>
      <span className="num relative text-label-2">{l ? Number(l.sz).toFixed(market.szDecimals) : ""}</span>
    </button>
  );

  return (
    <div className="flex flex-col">
      <div className="flex justify-between px-2 pb-1 text-[10px] text-label-4">
        <span>Price</span>
        <span>Size ({market.baseCurrency})</span>
      </div>
      {Array.from({ length: ROWS }, (_, i) => row(asks[ROWS - 1 - i], "ask", i))}
      <div className="my-1 flex items-baseline justify-between gap-1 border-y border-line px-2 py-1.5">
        <span className="num truncate text-sm font-semibold">
          {Number.isFinite(bestBid + bestAsk) ? fmtPx((bestBid + bestAsk) / 2, d) : "—"}
        </span>
        <span className="num shrink-0 text-[10px] text-label-4">{Number.isFinite(spread) ? fmtPx(spread, d) : ""}</span>
      </div>
      {Array.from({ length: ROWS }, (_, i) => row(bids[i], "bid", i))}
    </div>
  );
}
