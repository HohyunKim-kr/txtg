import type { PerpMarket, Trader } from "@txgram/txflow";
import { AccountTabs } from "../components/AccountTabs";
import { Header } from "../components/Header";
import { Button } from "../components/ui";
import { useAccountState, useOpenOrders } from "../hooks/account";
import { useMarkets, useMids } from "../hooks/market";
import { fmtUsd } from "../lib/format";
import { useWallet } from "../wallet/context";

export function Portfolio({ trader, onDeposit, onWithdraw, onTrade }: { trader?: Trader; onDeposit(): void; onWithdraw(): void; onTrade(m?: PerpMarket): void }) {
  const { session, login } = useWallet();
  const account = useAccountState(session?.address);
  const orders = useOpenOrders(session?.address);
  const markets = useMarkets();
  const mids = useMids();
  return <div><Header account={account.data} onDeposit={onDeposit} onWithdraw={onWithdraw} /><div className="px-5 pt-8 pb-7 sm:px-8"><p className="text-[10px] tracking-[0.15em] text-label-3">YOUR PORTFOLIO</p><h1 className="num mt-3 text-4xl font-semibold">${fmtUsd(account.data?.marginSummary.accountValue)}</h1><div className="mt-5 grid grid-cols-2 gap-4 text-xs"><div><p className="text-label-3">Withdrawable</p><p className="num mt-1 text-base">${fmtUsd(account.data?.withdrawable)}</p></div><div><p className="text-label-3">Margin used</p><p className="num mt-1 text-base">${fmtUsd(account.data?.marginSummary.totalMarginUsed)}</p></div></div><div className="mt-6 grid grid-cols-2 gap-3"><Button className="h-12" onClick={session ? onDeposit : login}>{session ? "Deposit" : "Connect wallet"}</Button><Button variant="surface" className="h-12" onClick={onWithdraw} disabled={!session}>Withdraw</Button></div>{session && !trader && <button onClick={() => onTrade()} className="mt-4 text-xs text-primary">Complete setup to enable trading →</button>}{account.isError && <p role="alert" className="mt-4 text-sm text-sell">Could not load account. <button className="underline" onClick={() => account.refetch()}>Retry</button></p>}</div>{session && !account.isError && <AccountTabs positions={(account.data?.assetPositions ?? []).map((x) => x.position).filter((p) => Number(p.szi) !== 0)} orders={orders.data ?? []} markets={markets.data ?? []} mids={mids} trader={trader} onSelectMarket={onTrade} />}</div>;
}
