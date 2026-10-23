import { decimalsOf, marketPrice, roundPrice, roundSize, type L2Book, type PerpMarket, type Trader } from "@txgram/txflow";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { config } from "../config";
import { errorMessage, fmtUsd } from "../lib/format";
import { LeverageSheet } from "./LeverageSheet";
import { Button, Segmented, useToast } from "./ui";

type Side = "buy" | "sell";
type Kind = "market" | "limit";

export function OrderTicket({
  market,
  book,
  available,
  leverage,
  trader,
  pickedPrice,
}: {
  market: PerpMarket;
  book: L2Book | undefined;
  available: number;
  leverage: { value: number; mode: "cross" | "isolated" } | undefined;
  trader: Trader;
  pickedPrice?: { px: string; at: number };
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [side, setSide] = useState<Side>("buy");
  const [kind, setKind] = useState<Kind>("market");
  const [price, setPrice] = useState("");
  const [usd, setUsd] = useState("");
  const [busy, setBusy] = useState(false);
  const [levOpen, setLevOpen] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tif, setTif] = useState<"Gtc" | "Alo" | "Ioc">("Gtc");
  const [slippage, setSlippage] = useState("1");

  const isBuy = side === "buy";
  const lev = leverage?.value ?? 1;
  const bestBid = Number(book?.levels[0][0]?.px);
  const bestAsk = Number(book?.levels[1][0]?.px);
  const mid = (bestBid + bestAsk) / 2;

  // Reset inputs when switching markets.
  useEffect(() => {
    setPrice("");
    setUsd("");
  }, [market.index]);

  // A tapped book level becomes the limit price.
  useEffect(() => {
    if (!pickedPrice) return;
    setKind("limit");
    setPrice(pickedPrice.px);
  }, [pickedPrice]);

  const refPx = kind === "limit" ? Number(price) : isBuy ? bestAsk : bestBid;
  const size = refPx > 0 && Number(usd) > 0 ? roundSize(Number(usd) / refPx, market.szDecimals) : "";
  const maxUsd = available * lev * 0.995;
  const margin = Number(usd) / lev;

  const setPct = (pct: number) => setUsd(maxUsd > 0 ? String(Math.floor(maxUsd * pct * 100) / 100) : "");

  const submit = async () => {
    if (busy) return;
    if (market.haltTrading || market.delisted) return toast("error", "This market is not accepting orders");
    if (!leverage) return toast("error", "Loading account leverage. Try again shortly.");
    if (!Number.isFinite(Number(usd)) || Number(usd) <= 0) return toast("error", "Enter a valid order value");
    if (!reduceOnly && Number(usd) > maxUsd) return toast("error", "Order exceeds available margin (including a fee buffer)");
    if (!size || Number(size) <= 0) return toast("error", "Order size is too small");
    if (kind === "limit" && !(Number(price) > 0)) return toast("error", "Enter a price");
    if (kind === "market" && !Number.isFinite(mid)) return toast("error", "Loading the order book");
    const sizeCap = kind === "market" ? market.maxMarketOrderSize : market.maxLimitOrderSize;
    if (Number(size) > sizeCap) return toast("error", `Maximum order size is ${sizeCap} ${market.baseCurrency}`);
    setBusy(true);
    try {
      await trader.order([
        {
          asset: market.index,
          isBuy,
          price:
            kind === "market"
              ? marketPrice(refPx, isBuy, market.priceTick, Number(slippage) / 100)
              : roundPrice(price, market.priceTick, isBuy ? "down" : "up"),
          size,
          tif: kind === "market" ? "FrontendMarket" : tif,
          reduceOnly,
          marginMode: leverage?.mode ?? "cross",
        },
      ]);
      toast("success", `${isBuy ? "Buy" : "Sell"} ${size} ${market.baseCurrency} ${kind === "market" ? "submitted" : "placed"}`);
      setUsd("");
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      for (const key of ["clearinghouse", "openOrders", "fills"]) void qc.invalidateQueries({ queryKey: [key] });
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Segmented
        value={side}
        onChange={setSide}
        options={[
          { value: "buy", label: "Buy / Long", activeClass: "bg-buy text-on-primary" },
          { value: "sell", label: "Sell / Short", activeClass: "bg-sell text-white" },
        ]}
      />
      <div className="flex gap-2">
        <button
          disabled={!leverage}
          onClick={() => setLevOpen(true)}
          className="flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-surface text-xs font-semibold"
        >
          <span className="text-label-3">{leverage?.mode === "isolated" ? "Isolated" : "Cross"}</span>
          <span className="text-primary">{lev}x</span>
        </button>
        <Segmented
          className="flex-[1.4]"
          value={kind}
          onChange={setKind}
          options={[
            { value: "market", label: "Market" },
            { value: "limit", label: "Limit" },
          ]}
        />
      </div>

      {kind === "limit" && (
        <Field
          label="Price"
          unit="USDC"
          value={price}
          onChange={setPrice}
          placeholder={Number.isFinite(mid) ? mid.toFixed(decimalsOf(market.priceTick)) : ""}
          action={
            Number.isFinite(mid) ? (
              <button onClick={() => setPrice(mid.toFixed(decimalsOf(market.priceTick)))} className="text-[10px] text-primary">
                Mid
              </button>
            ) : undefined
          }
        />
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-label-3">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)} className="accent-primary" /> Reduce only</label>
        {kind === "limit" ? <select aria-label="Time in force" className="rounded bg-surface p-1.5 text-label-2" value={tif} onChange={(e) => setTif(e.target.value as typeof tif)}><option value="Gtc">GTC</option><option value="Alo">Post only</option><option value="Ioc">IOC</option></select> : <label className="flex items-center gap-1">Slippage<select aria-label="Slippage" className="rounded bg-surface p-1.5 text-label-2" value={slippage} onChange={(e) => setSlippage(e.target.value)}>{["0.1", "0.5", "1"].map((s) => <option key={s} value={s}>{s}%</option>)}</select></label>}
      </div>
      <Field label="Order value" unit="USDC" value={usd} onChange={setUsd} placeholder="0" />

      <div className="grid grid-cols-4 gap-1.5">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <button key={p} onClick={() => setPct(p)} className="rounded-md bg-surface py-1 text-[11px] text-label-2 active:bg-surface-2">
            {p * 100}%
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1 text-[11px]">
        <Row label="Size" value={size ? `${size} ${market.baseCurrency}` : "—"} />
        <Row label="Margin required" value={Number(usd) > 0 ? `${fmtUsd(margin)} USDC` : "—"} />
        <Row label="Available" value={`${fmtUsd(available)} USDC`} />
      </div>

      <Button variant={isBuy ? "buy" : "sell"} className="h-11 w-full" disabled={!leverage || market.haltTrading} loading={busy} onClick={submit}>
        {isBuy ? "Buy / Long" : "Sell / Short"}
      </Button>
      {config.builder && (
        <p className="text-center text-[10px] text-label-4">
          Exchange fee + txgram fee {config.builder.fee / 1000}%
        </p>
      )}

      {leverage && (
        <LeverageSheet open={levOpen} onClose={() => setLevOpen(false)} market={market} current={leverage} trader={trader} />
      )}
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  placeholder,
  action,
}: {
  label: string;
  unit: string;
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  action?: ReactNode;
}) {
  return (
    <label className="flex flex-col rounded-lg bg-surface px-3 py-1.5">
      <span className="flex justify-between text-[10px] text-label-4">
        {label}
        {action}
      </span>
      <span className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          className="num min-w-0 flex-1 bg-transparent py-0.5 text-sm placeholder:text-label-4"
        />
        <span className="text-[11px] text-label-3">{unit}</span>
      </span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-label-4">{label}</span>
      <span className="num text-label-2">{value}</span>
    </div>
  );
}
