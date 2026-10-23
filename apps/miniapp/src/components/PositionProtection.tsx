import { matchesPosition, marketPrice, roundPrice, roundSize, type OrderInput, type PerpMarket, type Position, type Trader } from "@txgram/txflow";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "../lib/format";
import { tx } from "../lib/txflow";
import { useWallet } from "../wallet/context";
import { Button, Sheet, useToast } from "./ui";

export function PositionProtection({ position, market, trader }: { position: Position; market: PerpMarket; trader: Trader }) {
  const [open, setOpen] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { session } = useWallet();
  const qc = useQueryClient();
  const toast = useToast();
  const save = async () => {
    if (!session || busy) return;
    setBusy(true); setError("");
    try {
      const [account, context] = await Promise.all([tx.info.clearinghouseState(session.address), tx.info.activeAssetCtx(market.index)]);
      const current = account.assetPositions.map((p) => p.position).find((p) => matchesPosition(p, position));
      if (!current) throw new Error("This position is already closed");
      const ref = Number(context.nodeCtx.markPx);
      if (!(ref > 0)) throw new Error("Mark price unavailable");
      const long = Number(current.szi) > 0;
      const orders: OrderInput[] = [];
      for (const [kind, value] of [["tp", tp], ["sl", sl]] as const) {
        if (!value) continue;
        const triggerPx = roundPrice(value, market.priceTick);
        const n = Number(triggerPx);
        const above = kind === "tp" ? long : !long;
        if (!(n > 0) || (above ? n <= ref : n >= ref)) throw new Error(`${kind === "tp" ? "Take profit" : "Stop loss"} must be ${above ? "above" : "below"} the current mark price`);
        orders.push({ asset: market.index, isBuy: !long, price: marketPrice(n, !long, market.priceTick), size: roundSize(Math.abs(Number(current.szi)), market.szDecimals), reduceOnly: true, tif: "FrontendMarket", marginMode: current.leverage.type.toLowerCase() === "isolated" ? "isolated" : "cross", trigger: { isMarket: true, triggerPx, tpsl: kind } });
      }
      if (!orders.length) throw new Error("Enter a take-profit or stop-loss price");
      await trader.order(orders, "positionTpsl");
      await qc.invalidateQueries({ queryKey: ["openOrders"] });
      toast("success", "Position protection submitted"); setOpen(false); setTp(""); setSl("");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  return <><Button variant="ghost" className="mt-2 h-8 w-full text-xs" onClick={() => setOpen(true)}>Set take profit / stop loss</Button><Sheet open={open} onClose={() => setOpen(false)} title={`${market.baseCurrency} · TP / SL`}><div className="flex flex-col gap-4 px-5 pb-6"><p className="text-xs text-label-3">Reduce-only market orders for your current position. Triggers do not guarantee an execution price.</p>{[["Take-profit price", tp, setTp], ["Stop-loss price", sl, setSl]].map(([label, value, setter]) => <label key={String(label)} className="text-xs text-label-3">{String(label)}<input aria-label={String(label)} inputMode="decimal" className="num mt-2 w-full rounded-lg border border-line-2 bg-surface p-3 text-label" placeholder="Optional" value={String(value)} disabled={busy} onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) (setter as (s: string) => void)(e.target.value); }} /></label>)}{error && <p role="alert" className="text-sm text-sell">{error}</p>}<Button className="h-12" loading={busy} onClick={save}>Save TP / SL</Button></div></Sheet></>;
}
