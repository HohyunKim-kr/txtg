import { decimalsOf, type PerpMarket } from "@txgram/txflow";
import { useMemo, useState } from "react";
import type { MarketCtx } from "../hooks/market";
import { fmtCompact, fmtPct, fmtPx } from "../lib/format";
import { Sheet } from "./ui";

const base = (m: PerpMarket) => m.baseCurrency;

export function MarketBar({
  market,
  ctx,
  markets,
  mids,
  onSelect,
}: {
  market: PerpMarket;
  ctx: MarketCtx | undefined;
  markets: PerpMarket[];
  mids: Record<string, string>;
  onSelect(m: PerpMarket): void;
}) {
  const [open, setOpen] = useState(false);
  const d = decimalsOf(market.priceTick);
  const px = ctx?.markPx ?? mids[market.name];
  const change = ctx?.prevDayPx && px ? Number(px) / Number(ctx.prevDayPx) - 1 : NaN;

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-1 pb-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-left">
          <span className="text-xl font-bold">{base(market)}</span>
          <span className="text-sm text-label-4">-USDC</span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            {market.maxLeverage}x
          </span>
          <span className="text-label-3">▾</span>
        </button>
        <div className="text-right">
          <div className="num text-lg font-semibold">{fmtPx(px, d)}</div>
          <div className={`num text-xs ${change >= 0 ? "text-buy" : "text-sell"}`}>{fmtPct(change)}</div>
        </div>
      </div>
      <div className="no-scrollbar flex gap-4 overflow-x-auto border-y border-line px-4 py-2 text-[11px] whitespace-nowrap">
        <Stat label="Oracle" value={fmtPx(ctx?.oraclePx, d)} />
        <Stat
          label="Funding (1h)"
          value={ctx ? `${(Number(ctx.funding) * 100).toFixed(4)}%` : "—"}
          className={ctx && Number(ctx.funding) < 0 ? "text-sell" : "text-buy"}
        />
        <Stat label="24h volume" value={ctx?.dayNtlVlm ? `$${fmtCompact(ctx.dayNtlVlm)}` : "—"} />
        <Stat label="Open interest" value={ctx ? fmtCompact(ctx.openInterest) : "—"} />
      </div>
      <MarketSheet
        open={open}
        onClose={() => setOpen(false)}
        markets={markets}
        mids={mids}
        onSelect={(m) => {
          onSelect(m);
          setOpen(false);
        }}
      />
    </>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <span className="text-label-4">{label} </span>
      <span className={`num text-label-2 ${className}`}>{value}</span>
    </div>
  );
}

function MarketSheet({
  open,
  onClose,
  markets,
  mids,
  onSelect,
}: {
  open: boolean;
  onClose(): void;
  markets: PerpMarket[];
  mids: Record<string, string>;
  onSelect(m: PerpMarket): void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(
    () => markets.filter((m) => !m.haltTrading && m.name.toLowerCase().includes(q.trim().toLowerCase())),
    [markets, q],
  );
  return (
    <Sheet open={open} onClose={onClose} title="Markets">
      <div className="px-4 pb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (BTC, ETH…)"
          className="h-10 w-full rounded-xl bg-surface px-3 text-sm placeholder:text-label-4"
        />
      </div>
      <div className="pb-4">
        {list.map((m) => (
          <button
            key={m.index}
            onClick={() => onSelect(m)}
            className="flex w-full items-center justify-between px-4 py-3 active:bg-surface"
          >
            <span className="flex items-center gap-2">
              <span className="font-semibold">{base(m)}</span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-label-3">{m.maxLeverage}x</span>
            </span>
            <span className="num text-sm text-label-2">{fmtPx(mids[m.name], decimalsOf(m.priceTick))}</span>
          </button>
        ))}
        {list.length === 0 && <div className="py-10 text-center text-sm text-label-4">No results</div>}
      </div>
    </Sheet>
  );
}
