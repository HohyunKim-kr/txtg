import { decimalsOf, type PerpMarket } from "@txgram/txflow";
import { useMemo, useState } from "react";
import { Header } from "../components/Header";
import { TokenIcon } from "../components/TokenIcon";
import { Button, Spinner } from "../components/ui";
import { config } from "../config";
import { useAccountState } from "../hooks/account";
import { useMarkets, useMarketStats, useMids } from "../hooks/market";
import { errorMessage, fmtCompact, fmtPct, fmtSigned, fmtUsd, fmtPx } from "../lib/format";
import { useWallet } from "../wallet/context";

type Filter = "all" | "popular" | "gainers";
export function Home({ onTrade, onDeposit, onWithdraw }: { onTrade(m?: PerpMarket): void; onDeposit(): void; onWithdraw(): void }) {
  const wallet = useWallet();
  const account = useAccountState(wallet.session?.address);
  const markets = useMarkets();
  const mids = useMids();
  const { stats, isError: statsError, isPending: statsPending, refetch: refreshStats } = useMarketStats();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(() => (markets.data ?? []).filter((m) => !m.haltTrading).map((market) => {
    const ctx = stats[String(market.index)] ?? stats[market.name] ?? stats[market.baseCurrency];
    const price = mids[market.name] ?? mids[market.baseCurrency] ?? mids[String(market.index)] ?? ctx?.lastPrice;
    const previous = Number(ctx?.prevDayPx);
    return { market, price, change: price && previous > 0 ? Number(price) / previous - 1 : NaN,
      volume: ctx?.dayNtlVlm ? Number(ctx.dayNtlVlm) : NaN };
  }), [markets.data, mids, stats]);
  const popular = rows.filter((r) => Number.isFinite(r.volume) && r.volume > 0).sort((a, b) => b.volume - a.volume).slice(0, 4);
  const list = rows.filter(({ market }) => market.name.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((r) => filter !== "gainers" || r.change > 0)
    .sort((a, b) => filter === "gainers" ? b.change - a.change : filter === "popular" ? (b.volume || 0) - (a.volume || 0) : a.market.index - b.market.index);
  const positions = account.data?.assetPositions.filter((p) => Number(p.position.szi) !== 0) ?? [];
  const pnl = positions.reduce((n, p) => n + Number(p.position.unrealizedPnl), 0);
  const volume = rows.reduce((n, r) => n + (Number.isFinite(r.volume) ? r.volume : 0), 0);

  return <div>
    <Header account={account.data} onDeposit={onDeposit} onWithdraw={onWithdraw} />
    <section className="border-b border-line px-5 pb-7 pt-6 sm:px-8 sm:py-8" aria-label="Account overview">
      <div className="flex items-center justify-between"><h1 className="text-xs text-label-3">Total balance <span className="ml-1 text-label-4">· USDC</span></h1><span className="flex items-center gap-1.5 text-[10px] text-label-3"><span className="size-1.5 rounded-full bg-primary" />{config.network.name === "testnet" ? "Testnet account" : "TxFlow account"}</span></div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <div><div className="num text-[42px] font-medium leading-tight tracking-[-0.05em] sm:text-5xl">{wallet.session ? `$${fmtUsd(account.data?.marginSummary.accountValue)}` : "$—"}</div><p className={`num mt-2 text-xs ${wallet.session && pnl < 0 ? "text-sell" : "text-label-3"}`}>{wallet.session && account.data ? <><span className={pnl >= 0 ? "text-buy" : "text-sell"}>{fmtSigned(pnl)} USDC</span> unrealized PnL</> : "Connect your wallet to view your balance"}</p></div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-72"><Button className="h-11 text-sm" onClick={wallet.session ? onDeposit : wallet.login}>{wallet.session ? "↓ Deposit" : "Connect wallet"}</Button><Button variant="surface" className="h-11 text-sm" onClick={wallet.session ? onWithdraw : () => onTrade()}>{wallet.session ? "↑ Withdraw" : "Explore markets"}</Button></div>
      </div>
      <div className="mt-6 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-fill py-4">
        {[{ label: "Available", value: wallet.session ? `$${fmtUsd(account.data?.withdrawable)}` : "—" }, { label: "Margin used", value: wallet.session ? `$${fmtUsd(account.data?.marginSummary.totalMarginUsed)}` : "—" }, { label: "Open positions", value: wallet.session && account.data ? String(positions.length) : "—" }].map((item) => <div key={item.label} className="px-3 sm:px-5"><p className="text-[10px] text-label-3 sm:text-xs">{item.label}</p><p className="num mt-1.5 text-sm sm:text-base">{item.value}</p></div>)}
      </div>
      {config.network.name === "testnet" && <p className="mt-3 text-[10px] text-label-4">Test funds · no monetary value</p>}
      {account.isError && <p role="alert" className="mt-3 text-xs text-sell">Account unavailable. <button onClick={() => account.refetch()} className="underline">Retry</button></p>}
    </section>
    <section className="border-b border-line py-6 sm:py-7" aria-label="Popular markets">
      <div className="flex items-center justify-between px-5 sm:px-8"><h2 className="text-base font-semibold">Popular markets <span className="ml-1 text-primary">↗</span></h2><span className="text-[10px] text-label-4">By 24h volume</span></div>
      <div className="no-scrollbar mt-4 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-1 sm:grid sm:grid-cols-4 sm:scroll-px-8 sm:px-8">
        {popular.length ? popular.map(({ market, price, change, volume }, i) => <button key={market.index} onClick={() => onTrade(market)} className="min-w-[154px] flex-1 snap-start rounded-xl border border-line bg-fill p-4 text-left transition hover:border-primary/40 hover:bg-surface sm:min-w-0"><div className="flex items-center gap-2"><TokenIcon symbol={market.baseCurrency} className="size-7" /><span className="text-xs font-semibold">{market.baseCurrency}</span><span className="ml-auto text-[10px] text-label-4">0{i + 1}</span></div><p className="num mt-4 text-base font-medium sm:text-lg">${fmtPx(price, decimalsOf(market.priceTick))}</p><p className={`num mt-1 text-xs ${change >= 0 ? "text-buy" : "text-sell"}`}>{fmtPct(change)}</p><p className="mt-4 border-t border-line pt-2 text-[10px] text-label-4">Vol. <span className="num text-label-3">${fmtCompact(volume)}</span></p></button>) : <div className="w-full rounded-xl border border-line p-5 text-xs text-label-3">{statsError ? <>Market stats unavailable. <button className="text-primary underline" onClick={() => refreshStats()}>Retry</button></> : statsPending ? <span className="flex items-center gap-2"><Spinner /> Loading market stats…</span> : "No volume stats available yet."}</div>}
      </div>
    </section>
    <section className="px-5 py-6 sm:px-8">
      <div className="flex items-end justify-between"><h2 className="text-lg font-semibold tracking-tight">Markets <span className="ml-1 text-sm font-normal text-label-4">{rows.length}</span></h2><span className="text-[10px] text-label-4">24h volume <span className="num text-label-3">{volume ? `$${fmtCompact(volume)}` : "—"}</span></span></div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-5" role="tablist" aria-label="Market filter">{([['all', 'All markets'], ['popular', 'Popular'], ['gainers', 'Top gainers']] as const).map(([value, label]) => <button role="tab" aria-selected={filter === value} key={value} onClick={() => setFilter(value)} className={`border-b-2 pb-2 text-xs font-medium ${filter === value ? "border-primary text-primary" : "border-transparent text-label-3"}`}>{label}</button>)}</div><input aria-label="Search markets" className="h-10 w-full rounded-lg border border-line bg-fill px-3 text-xs placeholder:text-label-4 sm:w-56" placeholder="Search markets…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_100px_70px] border-b border-line pb-3 text-[10px] text-label-4 sm:grid-cols-[minmax(0,1fr)_140px_100px_100px]"><span>Market / Leverage</span><span className="text-right">Price</span><span className="text-right">24h change</span><span className="hidden text-right sm:block">24h volume</span></div>
      {markets.isPending ? <div className="flex justify-center gap-2 py-12 text-sm text-label-3"><Spinner /> Loading markets…</div> : markets.isError ? <div role="alert" className="py-8 text-sm text-sell">{errorMessage(markets.error)} <button className="underline" onClick={() => markets.refetch()}>Retry</button></div> : list.length ? list.map(({ market: m, price, change, volume }) => <button key={m.index} onClick={() => onTrade(m)} className="grid w-full grid-cols-[minmax(0,1fr)_100px_70px] items-center border-b border-line py-4 text-left transition hover:bg-surface/40 sm:grid-cols-[minmax(0,1fr)_140px_100px_100px]"><div className="flex min-w-0 items-center gap-2.5"><TokenIcon symbol={m.baseCurrency} /><div className="min-w-0"><p className="truncate text-sm font-semibold">{m.baseCurrency}</p><p className="mt-0.5 text-[10px] text-label-4">Perp <span className="ml-1 rounded bg-surface-2 px-1 text-label-3">{m.maxLeverage}x</span></p></div></div><span className="num text-right text-xs sm:text-sm">{fmtPx(price, decimalsOf(m.priceTick))}</span><span className={`num text-right text-[11px] ${Number.isFinite(change) ? change >= 0 ? "text-buy" : "text-sell" : "text-label-4"}`}>{fmtPct(change)}</span><span className="num hidden text-right text-xs text-label-3 sm:block">{Number.isFinite(volume) ? `$${fmtCompact(volume)}` : "—"}</span></button>) : <p className="py-12 text-center text-sm text-label-3">No matching markets</p>}
      <p className="mt-5 text-[10px] leading-relaxed text-label-4">Executed on TxFlow · {config.builder ? `Additional txgram fee ${config.builder.fee / 1000}% per fill. Exchange fees also apply.` : "No additional txgram trading fee. Exchange fees apply."}</p>
    </section>
  </div>;
}
