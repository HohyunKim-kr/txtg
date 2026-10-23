import { decimalsOf, marketPrice, type OpenOrder, type PerpMarket, type Position, type Trader } from "@txgram/txflow";
import { useState } from "react";
import { errorMessage, fmtPct, fmtPx, fmtSigned, fmtUsd } from "../lib/format";
import { Button, useToast } from "./ui";

export function AccountTabs({
  positions,
  orders,
  markets,
  mids,
  trader,
  onSelectMarket,
}: {
  positions: Position[];
  orders: OpenOrder[];
  markets: PerpMarket[];
  mids: Record<string, string>;
  trader: Trader;
  onSelectMarket(m: PerpMarket): void;
}) {
  const [tab, setTab] = useState<"positions" | "orders">("positions");
  const byIndex = new Map(markets.map((m) => [m.index, m]));

  return (
    <div className="border-t border-line">
      <div className="flex gap-5 px-4 pt-3">
        {(
          [
            ["positions", `Positions ${positions.length || ""}`],
            ["orders", `Open orders ${orders.length || ""}`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 pb-2 text-sm font-semibold ${tab === k ? "border-primary text-label" : "border-transparent text-label-4"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 px-4 pt-3 pb-6">
        {tab === "positions" &&
          (positions.length ? (
            positions.map((p) => {
              const m = byIndex.get(Number(p.asset));
              return m ? (
                <PositionCard key={p.asset} p={p} m={m} mid={mids[m.name]} trader={trader} onOpen={() => onSelectMarket(m)} />
              ) : null;
            })
          ) : (
            <Empty text="No open positions" />
          ))}
        {tab === "orders" &&
          (orders.length ? (
            orders.map((o) => <OrderCard key={o.oid} o={o} m={byIndex.get(o.asset)} trader={trader} />)
          ) : (
            <Empty text="No open orders" />
          ))}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-label-4">{text}</div>;
}

function PositionCard({
  p,
  m,
  mid,
  trader,
  onOpen,
}: {
  p: Position;
  m: PerpMarket;
  mid: string | undefined;
  trader: Trader;
  onOpen(): void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const szi = Number(p.szi);
  const long = szi > 0;
  const pnl = Number(p.unrealizedPnl);
  const d = decimalsOf(m.priceTick);
  const ref = Number(mid ?? p.markPx);

  const close = async () => {
    if (!(ref > 0)) return toast("error", "Loading prices");
    setBusy(true);
    try {
      await trader.order([
        {
          asset: m.index,
          isBuy: !long,
          price: marketPrice(ref, !long, m.priceTick),
          size: Math.abs(szi).toFixed(m.szDecimals),
          reduceOnly: true,
          tif: "FrontendMarket",
          marginMode: p.leverage.type.toLowerCase() === "isolated" ? "isolated" : "cross",
        },
      ]);
      toast("success", `${m.baseCurrency} close submitted`);
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="flex items-center justify-between">
        <button onClick={onOpen} className="flex items-center gap-2">
          <span className="font-semibold">{m.baseCurrency}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${long ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"}`}>
            {long ? "Long" : "Short"} {p.leverage.value}x
          </span>
        </button>
        <div className={`num text-right text-sm font-semibold ${pnl >= 0 ? "text-buy" : "text-sell"}`}>
          {/* returnOnEquity is already in percent */}
          {fmtSigned(pnl)} <span className="text-[11px]">({fmtPct(Number(p.returnOnEquity) / 100)})</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-y-1 text-[11px]">
        <Kv k="Size" v={`${Math.abs(szi)}`} />
        <Kv k="Entry" v={fmtPx(p.entryPx, d)} />
        <Kv k="Mark" v={fmtPx(p.markPx ?? mid, d)} />
        <Kv k="Value" v={fmtUsd(p.positionValue)} />
        <Kv k="Margin" v={fmtUsd(p.marginUsed)} />
        <Kv k="Liq. price" v={fmtPx(p.liquidationPx, d)} warn />
      </div>
      <Button variant="surface" className="mt-3 h-9 w-full text-sm" loading={busy} onClick={close}>
        Market close
      </Button>
    </div>
  );
}

function OrderCard({ o, m, trader }: { o: OpenOrder; m: PerpMarket | undefined; trader: Trader }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const buy = o.side === "B";
  const cancel = async () => {
    setBusy(true);
    try {
      await trader.cancel([{ asset: o.asset, oid: o.oid }]);
      toast("success", "Cancel submitted");
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center justify-between rounded-xl bg-surface p-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{m?.baseCurrency ?? o.coin}</span>
          <span className={`text-[11px] font-semibold ${buy ? "text-buy" : "text-sell"}`}>
            {buy ? "Buy" : "Sell"}
            {o.reduceOnly ? " · Reduce only" : ""}
          </span>
        </div>
        <div className="num mt-1 text-[11px] text-label-3">
          {fmtPx(o.limitPx, m && decimalsOf(m.priceTick))} · {o.sz}
          {o.sz !== o.origSz && ` / ${o.origSz}`}
        </div>
      </div>
      <Button variant="surface" className="h-8 px-3 text-xs" loading={busy} onClick={cancel}>
        Cancel
      </Button>
    </div>
  );
}

function Kv({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-label-4">{k}</div>
      <div className={`num ${warn ? "text-warning" : "text-label-2"}`}>{v}</div>
    </div>
  );
}
