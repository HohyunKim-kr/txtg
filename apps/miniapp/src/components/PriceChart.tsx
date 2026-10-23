import { decimalsOf, type PerpMarket } from "@txgram/txflow";
import { CandlestickSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCandles } from "../hooks/market";
import { errorMessage, fmtPx } from "../lib/format";
import { Spinner } from "./ui";

type Interval = "1m" | "15m" | "1h";
export function PriceChart({ market }: { market: PerpMarket }) {
  const [interval, setInterval] = useState<Interval>("15m");
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<{ open: number; high: number; low: number; close: number }>();
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const initialized = useRef(false);
  const query = useCandles(market, interval);
  const candles = useMemo(() => [...new Map((query.data ?? [])
    .filter((c) => Number.isFinite(c.t) && [c.o, c.h, c.l, c.c].every((n) => Number.isFinite(Number(n)) && Number(n) > 0) && Number(c.h) >= Math.max(Number(c.o), Number(c.c)) && Number(c.l) <= Math.min(Number(c.o), Number(c.c)))
    .map((c) => [Math.floor(c.t / 1000), { time: Math.floor(c.t / 1000) as UTCTimestamp, open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c) }])).values()].sort((a, b) => Number(a.time) - Number(b.time)), [query.data]);

  useEffect(() => {
    if (!host.current) return;
    const api = createChart(host.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0b120a" }, textColor: "#98989f", fontSize: 10, fontFamily: "JetBrains Mono, monospace", attributionLogo: true },
      grid: { vertLines: { color: "#1c261c" }, horzLines: { color: "#1c261c" } },
      rightPriceScale: { borderColor: "#2b332c", minimumWidth: 66 },
      timeScale: { borderColor: "#2b332c", timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 7, shiftVisibleRangeOnNewBar: true },
      handleScroll: { pressedMouseMove: true, mouseWheel: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      crosshair: { vertLine: { color: "#6c6d74", labelBackgroundColor: "#343b33" }, horzLine: { color: "#6c6d74", labelBackgroundColor: "#343b33" } },
    });
    const prices = api.addSeries(CandlestickSeries, {
      upColor: "#5fd655", downColor: "#ff5d5c", borderVisible: false, wickUpColor: "#5fd655", wickDownColor: "#ff5d5c",
      priceFormat: { type: "price", precision: decimalsOf(market.priceTick), minMove: Number(market.priceTick) },
    });
    api.subscribeCrosshairMove((event) => {
      const bar = event.seriesData.get(prices);
      setHover(bar && "open" in bar ? bar : undefined);
    });
    // Retain a DOM-readable range for accessible inspection of pan/zoom state.
    api.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (host.current && range) host.current.dataset.range = `${range.from.toFixed(2)},${range.to.toFixed(2)}`;
    });
    chart.current = api; series.current = prices; initialized.current = false; setHover(undefined);
    return () => { api.remove(); chart.current = null; series.current = null; };
  }, [market.index, market.priceTick, interval]);

  useEffect(() => {
    if (!series.current || !candles.length) return;
    const scale = chart.current!.timeScale();
    const range = scale.getVisibleRange();
    const following = scale.scrollPosition() >= 0 && scale.scrollPosition() < 8;
    series.current.setData(candles);
    if (!initialized.current) {
      scale.setVisibleLogicalRange({ from: Math.max(0, candles.length - 65), to: candles.length + 4 });
      initialized.current = true;
    } else if (!following && range) scale.setVisibleRange(range);
  }, [candles, market.index, interval]);

  const zoom = (factor: number) => {
    const scale = chart.current?.timeScale(); const range = scale?.getVisibleLogicalRange();
    if (scale && range) {
      const center = (range.from + range.to) / 2; const half = (range.to - range.from) * factor / 2;
      scale.setVisibleLogicalRange({ from: center - half, to: center + half });
    }
  };
  const reset = () => {
    chart.current?.priceScale("right").applyOptions({ autoScale: true });
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 65), to: candles.length + 4 });
  };
  const current = hover ?? candles.at(-1);
  return <section className="border-y border-line bg-fill/40" aria-label={`${market.baseCurrency} price chart`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2"><div className="flex gap-1">{(["1m", "15m", "1h"] as const).map((i) => <button key={i} aria-pressed={i === interval} onClick={() => setInterval(i)} className={`rounded px-2 py-1.5 text-[11px] ${i === interval ? "bg-surface-2 text-primary" : "text-label-4 hover:text-label"}`}>{i}</button>)}</div><div className="flex items-center gap-1 text-label-3"><button aria-label="Zoom in chart" onClick={() => zoom(0.75)} className="size-8 rounded hover:bg-surface">+</button><button aria-label="Zoom out chart" onClick={() => zoom(1.3)} className="size-8 rounded hover:bg-surface">−</button><button onClick={reset} className="h-8 rounded px-2 text-[11px] hover:bg-surface">Reset</button><button aria-label={expanded ? "Collapse chart" : "Expand chart"} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="size-8 rounded hover:bg-surface">{expanded ? "↙" : "⛶"}</button></div></div>
    <div className="num flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[9px] sm:text-[10px]" aria-live="off">{current ? ([['O', current.open], ['H', current.high], ['L', current.low], ['C', current.close]] as const).map(([label, value]) => <span key={label}><span className="text-label-4">{label} </span><span className={current.close >= current.open ? "text-buy" : "text-sell"}>{fmtPx(value, decimalsOf(market.priceTick))}</span></span>) : <span className="text-label-4">{market.baseCurrency} / USDC · {interval}</span>}</div>
    <div className="relative"><div ref={host} tabIndex={0} role="application" aria-label="Interactive candlestick chart. Drag to pan, scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, Home resets." className={`w-full outline-none focus-visible:ring-1 focus-visible:ring-primary ${expanded ? "h-[460px] sm:h-[540px]" : "h-[270px] sm:h-[320px]"}`} onKeyDown={(e) => {
      if (["+", "=", "-", "ArrowLeft", "ArrowRight", "Home"].includes(e.key)) e.preventDefault();
      if (e.key === "+" || e.key === "=") zoom(0.75);
      if (e.key === "-") zoom(1.3);
      if (e.key === "Home") reset();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const scale = chart.current?.timeScale(); const range = scale?.getVisibleLogicalRange();
        if (scale && range) { const delta = e.key === "ArrowLeft" ? -10 : 10; scale.setVisibleLogicalRange({ from: range.from + delta, to: range.to + delta }); }
      }
    }} />
      {(query.isPending || query.isError || !candles.length) && <div className="absolute inset-0 flex items-center justify-center bg-fill text-xs text-label-3">{query.isPending ? <><Spinner /><span className="ml-2">Loading candles…</span></> : query.isError ? <span role="alert">{errorMessage(query.error)} <button onClick={() => query.refetch()} className="ml-2 text-primary underline">Retry</button></span> : "No candle history available for this market"}</div>}
    </div>
    <div className="flex flex-wrap justify-between gap-1 px-4 py-2 text-[9px] text-label-4"><span>Drag to move · Scroll or pinch to zoom · Times in UTC</span><a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView Lightweight Charts™ · Copyright (с) 2025 TradingView, Inc.</a></div>
  </section>;
}
