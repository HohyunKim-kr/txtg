import type { PerpMarket, Trader } from "@txgram/txflow";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "../lib/format";
import { Button, Segmented, Sheet, useToast } from "./ui";

export function LeverageSheet({
  open,
  onClose,
  market,
  current,
  trader,
}: {
  open: boolean;
  onClose(): void;
  market: PerpMarket;
  current: { value: number; mode: "cross" | "isolated" };
  trader: Trader;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [lev, setLev] = useState(current.value);
  const [mode, setMode] = useState(current.mode);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setLev(current.value);
      setMode(market.onlyIsolated ? "isolated" : current.mode);
    }
  }, [open, current.value, current.mode, market.onlyIsolated]);

  const presets = [1, 2, 5, 10, 20, 25, 50, 75, 100].filter((p) => p <= market.maxLeverage);

  const save = async () => {
    setBusy(true);
    try {
      if (mode !== current.mode) await trader.updateMarginMode(market.index, mode === "cross");
      if (lev !== current.value || mode !== current.mode) await trader.updateLeverage(market.index, lev, mode);
      await qc.invalidateQueries({ queryKey: ["leverage"] });
      toast("success", `${mode === "cross" ? "Cross" : "Isolated"} ${lev}x set`);
      onClose();
    } catch (e) {
      toast("error", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={`${market.baseCurrency} leverage`}>
      <div className="flex flex-col gap-5 px-4 pb-5">
        {!market.onlyIsolated && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "cross", label: "Cross" },
              { value: "isolated", label: "Isolated" },
            ]}
          />
        )}
        <div className="text-center">
          <span className="num text-4xl font-bold text-primary">{lev}</span>
          <span className="text-xl text-label-3">x</span>
        </div>
        <input
          type="range"
          min={1}
          max={market.maxLeverage}
          value={lev}
          onChange={(e) => setLev(Number(e.target.value))}
        />
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setLev(p)}
              className={`num rounded-lg px-3 py-1.5 text-xs ${lev === p ? "bg-primary text-on-primary" : "bg-surface-2 text-label-2"}`}
            >
              {p}x
            </button>
          ))}
        </div>
        <p className="text-xs text-label-4">
          Higher leverage moves your liquidation price closer to the market. Leverage can't change while you have open orders.
        </p>
        <Button className="h-12 w-full" loading={busy} onClick={save}>
          Apply
        </Button>
      </div>
    </Sheet>
  );
}
