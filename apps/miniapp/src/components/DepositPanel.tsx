import { depositAddress, depositRoutes } from "@txgram/txflow";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type ReactNode } from "react";
import { config } from "../config";
import { copyText } from "../lib/clipboard";
import { useLedger } from "../hooks/account";
import { errorMessage, fmtUsd } from "../lib/format";
import type { WalletSession } from "../wallet/context";
import { TokenIcon } from "./TokenIcon";
import { Button, Spinner, useToast } from "./ui";

type Method = "transfer" | "wallet" | "test";
export function DepositPanel({ session, children, onFaucet, busy, blocked }: {
  session: WalletSession; children: ReactNode; onFaucet(): void; busy: boolean; blocked: boolean;
}) {
  const testnet = config.network.name === "testnet";
  const [method, setMethod] = useState<Method>(testnet ? "test" : "transfer");
  const [chain, setChain] = useState("");
  const [networksOpen, setNetworksOpen] = useState(false);
  const [issuedAt, setIssuedAt] = useState(Date.now());
  const toast = useToast();
  const qc = useQueryClient();
  const ledger = useLedger(session.address);
  const routes = useQuery({ queryKey: ["depositRoutes", config.network.name], queryFn: () => depositRoutes(config.network), enabled: method === "transfer", retry: false, staleTime: 60_000 });
  const route = routes.data?.find((r) => r.network.chain === chain) ?? routes.data?.[0];
  const address = useQuery({ queryKey: ["depositAddress", config.network.name, session.address, route?.network.chain, route?.token.symbol],
    queryFn: () => depositAddress(config.network, route!, session.address), enabled: method === "transfer" && !!route,
    retry: false, staleTime: Infinity, refetchOnMount: false });
  const received = ledger.data?.data.find((r) => r.delta.type === "deposit" && r.time >= issuedAt && ["completed", "success", "confirmed"].includes(r.delta.status?.toLowerCase() ?? ""));
  useEffect(() => {
    if (received) {
      void qc.invalidateQueries({ queryKey: ["clearinghouse", session.address] });
      void qc.invalidateQueries({ queryKey: ["onboarding", session.address] });
    }
  }, [received?.hash, qc, session.address]);
  const copy = (text: string) => { void copyText(text).then(() => toast("info", "Copied"), () => toast("error", "Could not copy. Select the address to copy it.")); };

  return <>
    <div className="flex gap-1 rounded-xl bg-surface p-1" role="tablist" aria-label="Deposit method">
      {(testnet ? [["test", "Test funds"], ["transfer", "Transfer"], ["wallet", "From wallet"]] as const : [["transfer", "Crypto transfer"], ["wallet", "From wallet"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={method === value} onClick={() => setMethod(value)} className={`flex-1 rounded-lg px-2 py-2.5 text-xs font-medium ${method === value ? "bg-surface-3 text-label" : "text-label-3"}`}>{label}</button>)}
    </div>
    {method === "test" ? <div className="py-5 text-center"><TokenIcon symbol="USDC" className="mx-auto size-14" /><h3 className="mt-4 text-xl font-semibold">Ready to try perpetuals?</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-label-3">Get free test USDC directly in your trading account. No transfer needed.</p><Button className="mt-6 h-12 w-full" loading={busy} disabled={blocked} onClick={onFaucet}>Get test USDC</Button><p className="mt-3 text-[11px] text-label-4">Testnet only · These funds have no monetary value.</p></div> : method === "wallet" ? children : <>
      <div className="grid grid-cols-[0.85fr_1.15fr] gap-3">
        <div><p className="mb-2 text-[11px] text-label-3">Asset</p><div className="flex h-12 items-center gap-2 rounded-xl border border-line-2 bg-surface px-3"><TokenIcon symbol="USDC" className="size-6" /><span className="text-sm font-semibold">USDC</span></div></div>
        <div className="relative"><p className="mb-2 text-[11px] text-label-3">Network</p><button aria-expanded={networksOpen} aria-controls="deposit-networks" disabled={!routes.data?.length} onClick={() => setNetworksOpen((v) => !v)} className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-line-2 bg-surface px-3 text-left text-sm"><span className="truncate">{route?.network.chain_name ?? "Choose network"}</span><span className="text-label-3">⌄</span></button>
          {networksOpen && <div id="deposit-networks" className="absolute right-0 top-full z-10 mt-2 max-h-64 w-[min(300px,80vw)] overflow-y-auto rounded-xl border border-line-2 bg-surface p-1 shadow-xl" aria-label="Available deposit networks">{routes.data?.map((r) => <button key={`${r.network.chain}:${r.token.symbol}`} aria-pressed={route?.network.chain === r.network.chain} onClick={() => { setChain(r.network.chain); setNetworksOpen(false); setIssuedAt(Date.now()); }} className="flex w-full items-center justify-between gap-4 rounded-lg p-3 text-left text-xs hover:bg-surface-2"><span>{r.network.chain_name} {r.network.chain === route?.network.chain && <span className="text-primary">✓</span>}</span><span className="num rounded bg-surface-2 px-2 py-1 text-[10px] text-label-3">Min. {r.token.min_amount} USDC</span></button>)}</div>}
        </div>
      </div>
      {routes.isPending ? <div className="flex h-56 items-center justify-center gap-2 text-xs text-label-3"><Spinner /> Loading supported networks…</div> : routes.isError || !route ? <div role="alert" className="rounded-xl border border-line-2 p-5 text-center"><p className="text-sm">Deposit addresses unavailable</p><p className="mt-2 text-xs leading-relaxed text-label-3">{routes.isError ? errorMessage(routes.error) : "No USDC trading collateral routes are currently enabled."}</p><button onClick={() => routes.refetch()} className="mt-4 text-xs text-primary">Retry</button>{testnet && <p className="mt-3 text-[11px] text-label-4">You can get test funds without using a bridge.</p>}</div> : <>
        <p className="text-center text-xs text-label-3">Send USDC on <span className="text-label">{route.network.chain_name}</span></p>
        <div className="flex justify-center py-1">{address.data && !address.isFetching ? <div className="rounded-2xl bg-white p-4"><QRCodeSVG value={address.data.deposit_address} size={172} level="M" title={`USDC deposit address on ${route.network.chain_name}`} /></div> : <div className="flex size-[204px] items-center justify-center rounded-2xl border border-line-2">{address.isError ? <button className="px-4 text-xs text-primary" onClick={() => address.refetch()}>Retry address</button> : <Spinner className="size-6 text-label-3" />}</div>}</div>
        {address.isError && <p role="alert" className="text-center text-xs text-sell">{errorMessage(address.error)}</p>}
        {address.data && !address.isFetching && <><div className="rounded-xl border border-line-2 bg-surface p-3"><p className="text-[10px] text-label-4">Your deposit address</p><div className="mt-1.5 flex items-center gap-3"><p className="min-w-0 flex-1 select-all break-all font-mono text-xs leading-relaxed">{address.data.deposit_address}</p><button aria-label="Copy deposit address" onClick={() => copy(address.data.deposit_address)} className="shrink-0 rounded-lg bg-surface-2 px-3 py-2 text-xs text-primary">Copy</button></div></div>{address.data.memo && <div className="rounded-xl border border-warning/40 p-3"><p className="text-xs text-warning">Memo required</p><button onClick={() => copy(address.data.memo!)} className="mt-1 select-all break-all font-mono text-sm">{address.data.memo} <span className="text-xs text-primary">Copy</span></button></div>}</>}
        <div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-label-3">Minimum deposit</span><span className="num">{route.token.min_amount} USDC</span></div><div className="flex justify-between"><span className="text-label-3">Deposit fee</span><span className="num">{route.token.deposit_fee} USDC</span></div><div className="flex justify-between"><span className="text-label-3">Estimated arrival</span><span>~{route.network.deposit_eta_minutes} min</span></div></div>
        <p className="text-[10px] leading-relaxed text-label-4">Only send USDC on {route.network.chain_name}. {route.token.token_address && <>Supported token: <span className="select-all break-all font-mono">{route.token.token_address}</span>. </>}Maximum {fmtUsd(route.token.max_amount, 0)} USDC per transfer. Funds are credited to your TxFlow trading account.</p>
        {address.data && <div role="status" className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-xs ${received ? "border-primary/30 bg-primary/5 text-primary" : "border-line bg-surface text-label-3"}`}>{received ? <>✓ Trading account credited · {received.delta.amount} USDC</> : <><Spinner className="size-3" /> Waiting for deposit</>}</div>}
      </>}
    </>}
  </>;
}
