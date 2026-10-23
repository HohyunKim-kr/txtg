import { useMemo, useState, type ReactNode } from "react";
import type { PerpMarket } from "@txgram/txflow";
import { FundsSheet, type FundsMode } from "./components/FundsSheet";
import { Wordmark } from "./components/Logo";
import { Button, Spinner } from "./components/ui";
import { useOnboarding } from "./hooks/onboarding";
import { errorMessage } from "./lib/format";
import { tx } from "./lib/txflow";
import { config } from "./config";
import { Home } from "./screens/Home";
import { Login } from "./screens/Login";
import { Onboarding } from "./screens/Onboarding";
import { Portfolio } from "./screens/Portfolio";
import { Trade } from "./screens/Trade";
import { useWallet } from "./wallet/context";

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[65vh] flex-col items-center justify-center gap-4 px-8 text-center">{children}</div>;
}

type View = "home" | "trade" | "portfolio";
export function App() {
  const wallet = useWallet();
  const ob = useOnboarding(wallet.session);
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<number>();
  const [funds, setFunds] = useState<FundsMode | null>(null);
  const trader = useMemo(() => ob.state.data?.agent && ob.state.data.agentOk
    ? tx.trader(ob.state.data.agent, config.builder) : undefined, [ob.state.data?.agent, ob.state.data?.agentOk]);
  const onTrade = (market?: PerpMarket) => { if (market) { setSelected(market.index); localStorage.setItem("txgram:market", String(market.index)); } setView("trade"); window.scrollTo(0, 0); };
  const onDeposit = () => wallet.session ? setFunds("deposit") : wallet.login();
  const onWithdraw = () => wallet.session ? setFunds("withdraw") : wallet.login();
  let content: ReactNode;
  if (view === "home") content = <Home onTrade={onTrade} onDeposit={onDeposit} onWithdraw={onWithdraw} />;
  else if (view === "portfolio") content = <Portfolio trader={trader} onTrade={onTrade} onDeposit={onDeposit} onWithdraw={onWithdraw} />;
  else if (!wallet.ready) content = <Centered><Wordmark className="text-3xl" /><Spinner className="size-5 text-primary" /></Centered>;
  else if (!wallet.session) content = <Login />;
  else if (ob.state.isPending) content = <Centered><Spinner className="size-6 text-primary" /><span className="text-sm text-label-3">Checking trading account…</span></Centered>;
  else if (ob.state.isError) content = <Centered><p className="text-sm text-sell">{errorMessage(ob.state.error)}</p><Button variant="surface" className="h-10 px-5" onClick={() => ob.refresh()}>Retry account setup</Button></Centered>;
  else if (ob.state.data.geoBlocked) content = <Centered><h1 className="text-xl font-semibold">Trading is not available in your region</h1><p className="text-sm text-label-3">Your portfolio and withdrawals remain accessible from the navigation.</p></Centered>;
  else if (!ob.state.data.funded || !ob.state.data.builderOk || !ob.state.data.agentOk || !ob.state.data.agent) content = <Onboarding ob={ob} onDeposit={onDeposit} />;
  else content = <Trade key={selected} session={wallet.session} agent={ob.state.data.agent} initialMarket={selected} onDeposit={onDeposit} onWithdraw={onWithdraw} />;

  return <div className="app-shell">
    <main className="min-h-[calc(100dvh-80px)] pb-24">{content}</main>
    <nav aria-label="Main navigation" className="app-nav">
      {([ ["home", "Home", "◈"], ["trade", "Trade", "⇄"], ["portfolio", "Portfolio", "▤"] ] as const).map(([key, label, icon]) => <button key={key} aria-current={view === key ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] ${view === key ? "text-primary" : "text-label-4"}`} onClick={() => { setView(key); window.scrollTo(0, 0); }}><span aria-hidden="true" className="text-xl leading-none">{icon}</span>{label}</button>)}
    </nav>
    {wallet.session && <FundsSheet key={`${config.network.name}:${wallet.session.address}`} mode={funds} onClose={() => setFunds(null)} session={wallet.session} />}
  </div>;
}
