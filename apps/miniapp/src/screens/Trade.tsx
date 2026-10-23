import type { PerpMarket } from "@txgram/txflow";
import { useMemo, useState } from "react";
import type { LocalAccount } from "viem";
import { AccountTabs } from "../components/AccountTabs";
import { Header } from "../components/Header";
import { MarketBar } from "../components/MarketBar";
import { OrderBook } from "../components/OrderBook";
import { OrderTicket } from "../components/OrderTicket";
import { Spinner } from "../components/ui";
import { PriceChart } from "../components/PriceChart";
import { config } from "../config";
import { useAccountState, useLeverage, useOpenOrders } from "../hooks/account";
import { useAssetCtx, useBook, useMarkets, useMids } from "../hooks/market";
import { tx } from "../lib/txflow";
import type { WalletSession } from "../wallet/context";

const LAST_MARKET = "txgram:market";

export function Trade({ session, agent, initialMarket, onDeposit, onWithdraw }: { session: WalletSession; agent: LocalAccount; initialMarket?: number; onDeposit(): void; onWithdraw(): void }) {
  const markets = useMarkets();
  const mids = useMids();
  const [index, setIndex] = useState(() => initialMarket ?? Number(localStorage.getItem(LAST_MARKET) ?? 1));
  const market = useMemo(
    () => markets.data?.find((m) => m.index === index) ?? markets.data?.[0],
    [markets.data, index],
  );
  const book = useBook(market);
  const ctx = useAssetCtx(market);
  const account = useAccountState(session.address);
  const orders = useOpenOrders(session.address);
  const leverage = useLeverage(session.address, market);
  const trader = useMemo(() => tx.trader(agent, config.builder), [agent]);
  const [picked, setPicked] = useState<{ px: string; at: number }>();

  const select = (m: PerpMarket) => {
    localStorage.setItem(LAST_MARKET, String(m.index));
    setIndex(m.index);
  };

  if (!market) {
    return (
      <div className="flex h-full items-center justify-center">
        {markets.isError ? <button className="text-sm text-sell" onClick={() => markets.refetch()}>Markets unavailable · Retry</button> : <Spinner className="size-6 text-primary" />}
      </div>
    );
  }

  const positions = (account.data?.assetPositions ?? []).map((p) => p.position).filter((p) => Number(p.szi) !== 0);
  const available = Number(account.data?.availableToTrade ?? account.data?.withdrawable ?? 0);

  return (
    <div className="min-h-full pb-[env(safe-area-inset-bottom)]">
      <Header account={account.data} onDeposit={onDeposit} onWithdraw={onWithdraw} />
      <MarketBar market={market} ctx={ctx} markets={markets.data ?? []} mids={mids} onSelect={select} />
      {account.isError && <p role="alert" className="px-4 py-2 text-xs text-sell">Account data unavailable. <button className="underline" onClick={() => account.refetch()}>Retry</button></p>}
      <PriceChart market={market} />
      <div className="grid grid-cols-[1fr_1.15fr] gap-3 px-2 pt-3 pb-4 lg:gap-6 lg:px-6">
        <OrderBook market={market} book={book} onPick={(px) => setPicked({ px, at: Date.now() })} />
        <div className="pr-2">
          <OrderTicket
            market={market}
            book={book}
            available={available}
            leverage={leverage.data}
            trader={trader}
            pickedPrice={picked}
          />
        </div>
      </div>
      <AccountTabs
        positions={positions}
        orders={orders.data ?? []}
        markets={markets.data ?? []}
        mids={mids}
        trader={trader}
        onSelectMarket={select}
      />
    </div>
  );
}
