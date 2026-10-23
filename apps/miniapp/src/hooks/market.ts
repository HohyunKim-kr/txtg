import type { AssetCtx, L2Book, PerpMarket } from "@txgram/txflow";
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
    tx.info.l2Book(market.index).then((b) => !live && setBook(b), () => undefined);
    return socket.subscribe({ type: "l2Book", coin: String(market.index) }, (d) => {
      const b = d as L2Book;
      if (b.coin !== market.name && b.coin !== String(market.index)) return;
      live = true;
      setBook(b);
    });
  }, [market]);
  return book;
}

export interface MarketCtx extends AssetCtx {
  prevDayPx?: string;
  dayNtlVlm?: string;
}

export function useAssetCtx(market: PerpMarket | undefined): MarketCtx | undefined {
  const [ctx, setCtx] = useState<MarketCtx>();
  useEffect(() => {
    if (!market) return;
    setCtx(undefined);
    let day: Pick<MarketCtx, "prevDayPx" | "dayNtlVlm"> = {};
    tx.info.activeAssetCtx(market.index).then(
      (c) => {
        day = { prevDayPx: c.prevDayPx, dayNtlVlm: c.dayNtlVlm };
        setCtx((cur) => ({ ...c.nodeCtx, ...cur, ...day }));
      },
      () => undefined,
    );
    return socket.subscribe({ type: "activeAssetCtx", coin: String(market.index) }, (d) => {
      const { coin, ctx } = d as { coin: string; ctx: AssetCtx };
      if (coin === String(market.index)) setCtx({ ...ctx, ...day });
    });
  }, [market]);
  return ctx;
}
