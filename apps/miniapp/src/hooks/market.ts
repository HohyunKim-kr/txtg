import type { AssetCtx, L2Book, MarketStats, PerpMarket } from "@txgram/txflow";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { socket, tx } from "../lib/txflow";

export function useMarkets() {
  return useQuery({
    queryKey: ["perpMeta"],
    queryFn: async () => (await tx.info.perpMeta()).filter((m) => !m.delisted),
    staleTime: Infinity,
  });
}

/** Mid price of every market, keyed by name (`BTC-USDC`). */
export function useMids(): Record<string, string> {
  const [mids, setMids] = useState<Record<string, string>>({});
  useEffect(
    () =>
      socket.subscribe({ type: "allMids" }, (d) => {
        const next = (d as { mids?: Record<string, string> }).mids;
        if (next) setMids(next);
      }),
    [],
  );
  return mids;
}

export function useBook(market: PerpMarket | undefined): L2Book | undefined {
  const [book, setBook] = useState<L2Book>();
  useEffect(() => {
    if (!market) return;
    setBook(undefined);
    let live = false;
    let cancelled = false;
    tx.info.l2Book(market.index).then((b) => !cancelled && !live && setBook(b), () => undefined);
    const unsubscribe = socket.subscribe({ type: "l2Book", coin: String(market.index) }, (d) => {
      const b = d as L2Book;
      if (b.coin !== market.name && b.coin !== String(market.index)) return;
      live = true;
      setBook(b);
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [market]);
  return book;
}

export interface MarketCtx extends AssetCtx {
  prevDayPx?: string;
  dayNtlVlm?: string;
}

/** Snapshot for immediate rows; the public stream supplies live stats thereafter. */
export function useMarketStats() {
  const snapshot = useQuery({ queryKey: ["marketStats"], queryFn: () => tx.info.marketStats(), refetchInterval: 60_000 });
  const [live, setLive] = useState<Record<string, Partial<MarketStats> & Partial<MarketCtx>>>({});
  useEffect(() => socket.subscribe({ type: "allAssetCtxs" }, (data) => {
    const rows = (data as { ctxs?: { coin: string; ctx: MarketCtx }[] }).ctxs;
    if (rows) setLive(Object.fromEntries(rows.map((row) => [row.coin, row.ctx])));
  }), []);
  const stats: Record<string, Partial<MarketStats> & Partial<MarketCtx>> = {};
  for (const row of snapshot.data ?? []) stats[String(row.instrumentId)] = row;
  for (const [key, row] of Object.entries(live)) {
    const populated = Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined && value !== ""));
    stats[key] = { ...stats[key], ...populated };
  }
  return { ...snapshot, stats };
}

export function useAssetCtx(market: PerpMarket | undefined): MarketCtx | undefined {
  const [ctx, setCtx] = useState<MarketCtx>();
  useEffect(() => {
    if (!market) return;
    setCtx(undefined);
    let cancelled = false;
    let day: Pick<MarketCtx, "prevDayPx" | "dayNtlVlm"> = {};
    tx.info.activeAssetCtx(market.index).then(
      (c) => {
        if (cancelled) return;
        day = { prevDayPx: c.prevDayPx, dayNtlVlm: c.dayNtlVlm };
        setCtx((cur) => ({ ...c.nodeCtx, ...cur, ...day }));
      },
      () => undefined,
    );
    const unsubscribe = socket.subscribe({ type: "activeAssetCtx", coin: String(market.index) }, (d) => {
      const { coin, ctx } = d as { coin: string; ctx: AssetCtx };
      if ([String(market.index), market.name, market.baseCurrency].includes(coin)) setCtx({ ...ctx, ...day });
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [market]);
  return ctx;
}

export function useCandles(market: PerpMarket, interval: "1m" | "15m" | "1h") {
  return useQuery({ queryKey: ["candles", market.index, interval], queryFn: () => {
    const end = Date.now();
    const step = interval === "1m" ? 60_000 : interval === "15m" ? 900_000 : 3_600_000;
    return tx.info.candles(market.index, interval, end - step * 500, end);
  }, refetchInterval: 15_000 });
}
