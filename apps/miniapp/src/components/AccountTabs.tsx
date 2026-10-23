import { closePosition, decimalsOf, type OpenOrder, type PerpMarket, type Position, type Trader } from "@txgram/txflow";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useFills, useLedger } from "../hooks/account";
import { errorMessage, fmtPct, fmtPx, fmtSigned, fmtUsd } from "../lib/format";
import { tx } from "../lib/txflow";
import { useWallet } from "../wallet/context";
import { Button, useToast } from "./ui";
import { PositionProtection } from "./PositionProtection";

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
  trader?: Trader;
  onSelectMarket(m: PerpMarket): void;
}) {
  const [tab, setTab] = useState<"positions" | "orders" | "history" | "activity">("positions");
  const { session } = useWallet();
  const fills = useFills(session?.address);
  const ledger = useLedger(session?.address);
  const byIndex = new Map(markets.map((m) => [m.index, m]));

  return (
    <div className="border-t border-line">
      <div className="no-scrollbar flex gap-5 overflow-x-auto px-4 pt-3">
        {(
          [
            ["positions", `Positions ${positions.length || ""}`],
            ["orders", `Open orders ${orders.length || ""}`],
            ["history", "Trade history"],
            ["activity", "Activity"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`shrink-0 border-b-2 pb-2 text-xs font-semibold ${tab === k ? "border-primary text-label" : "border-transparent text-label-4"}`}
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
                <PositionCard key={`${p.asset}:${p.leverage.type}:${Math.sign(Number(p.szi))}`} p={p} m={m} mid={mids[m.name]} trader={trader} onOpen={() => onSelectMarket(m)} />
              ) : null;
            })
          ) : (
            <Empty text="No open positions" />
          ))}
        {tab === "orders" &&
          (orders.length ? (
            orders.map((o) => <OrderCard key={o.oid} o={o} m={byIndex.get(Number(o.asset))} trader={trader} />)
          ) : (
            <Empty text="No open orders" />
          ))}
        {tab === "history" && (fills.isPending ? <Empty text="Loading executions…" /> : fills.isError ? <Empty text={errorMessage(fills.error)} /> : fills.data.data.length ? fills.data.data.map((f) => <div key={`${f.tid}:${f.oid}:${f.side}`} className="flex justify-between gap-3 border-b border-line py-3 text-xs"><div><p className="font-semibold">{f.symbol ?? f.coin} <span className={f.side === "B" ? "text-buy" : "text-sell"}>{f.dir || (f.side === "B" ? "Buy" : "Sell")}</span></p><p className="mt-1 text-label-3">{new Date(f.time).toLocaleString()} · {f.tradeSide ?? "Fill"}</p><p className="num mt-1 text-label-2">{f.sz} @ {fmtPx(f.px)}</p></div><div className="num text-right"><p className={Number(f.closedPnl) >= 0 ? "text-buy" : "text-sell"}>{fmtSigned(f.closedPnl)} USDC</p><p className="mt-1 text-label-3">Fee {f.fee} USDC</p></div></div>) : <Empty text="No executions yet" />)}
        {tab === "activity" && (ledger.isPending ? <Empty text="Loading transfers…" /> : ledger.isError ? <Empty text={errorMessage(ledger.error)} /> : ledger.data.data.length ? ledger.data.data.map((r, i) => <div key={`${r.hash}:${i}`} className="flex justify-between gap-3 border-b border-line py-3 text-xs"><div><p className="font-semibold capitalize">{r.delta.type.replace(/([A-Z])/g, " $1")}</p><p className="mt-1 text-label-3">{new Date(r.time).toLocaleString()} · {r.delta.chain ?? "TxFlow"}</p><p className="mt-1 break-all font-mono text-[10px] text-label-4">{r.hash}</p></div><div className="shrink-0 text-right"><p className="num">{fmtUsd(r.delta.amount)} USDC</p><p className="mt-1 text-label-3">{r.delta.status ?? "Recorded"}</p></div></div>) : <Empty text="No deposits or withdrawals yet" />)}
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
  trader?: Trader;
  onOpen(): void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useWallet();
  const [busy, setBusy] = useState(false);
  const [fraction, setFraction] = useState(1);
  const szi = Number(p.szi);
  const long = szi > 0;
  const pnl = Number(p.unrealizedPnl);
  const d = decimalsOf(m.priceTick);

  const close = async () => {
    if (!trader || !session || busy) return;
    setBusy(true);
    try {
      const result = await closePosition(tx, session.address, trader, m, p, fraction);
      toast(result.status === "pending" ? "info" : "success", result.status === "closed" ? `${m.baseCurrency} position closed` : result.status === "reduced" ? `Position reduced · ${result.remaining} ${m.baseCurrency} remains` : "Close not confirmed. Check positions and history before retrying.");
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      for (const key of ["clearinghouse", "openOrders", "fills", "onboarding"]) void qc.invalidateQueries({ queryKey: [key, session.address] });
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
      <div className="mt-3 flex gap-2">{[0.25, 0.5, 1].map((value) => <button key={value} disabled={busy} onClick={() => setFraction(value)} className={`rounded-md px-3 py-1.5 text-xs ${value === fraction ? "bg-surface-3 text-label" : "text-label-3"}`}>{value * 100}%</button>)}</div>
      <Button variant="surface" className="mt-2 h-9 w-full text-sm" disabled={!trader} loading={busy} onClick={close}>
        {busy ? "Confirming close…" : `Market close ${fraction * 100}%`}
      </Button>
      {trader && <PositionProtection position={p} market={m} trader={trader} />}
    </div>
  );
}

function OrderCard({ o, m, trader }: { o: OpenOrder; m: PerpMarket | undefined; trader?: Trader }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const buy = o.side === "B";
  const cancel = async () => {
    if (!trader || busy) return;
    setBusy(true);
    try {
      await trader.cancel([{ asset: Number(o.asset), oid: o.oid }]);
      await qc.invalidateQueries({ queryKey: ["openOrders"] });
      void qc.invalidateQueries({ queryKey: ["clearinghouse"] });
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
        <p className="mt-1 text-[10px] text-label-3">{o.orderType}{o.isTrigger ? ` · Trigger ${o.triggerPx}` : ` · ${o.tif}`}</p>
        <div className="num mt-1 text-[11px] text-label-3">
          {fmtPx(o.limitPx, m && decimalsOf(m.priceTick))} · {o.sz}
          {o.sz !== o.origSz && ` / ${o.origSz}`}
        </div>
      </div>
      <Button variant="surface" className="h-8 px-3 text-xs" disabled={!trader} loading={busy} onClick={cancel}>
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
