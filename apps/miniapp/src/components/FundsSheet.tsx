import { DepositFailedError, PendingExchangeError, TxFlowError, bridgeClient, depositUsdc, nextNonce, readBridge, requestFund, withdrawalQuote } from "@txgram/txflow";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatUnits, isAddress, zeroAddress, type Address } from "viem";
import { config } from "../config";
import { copyText } from "../lib/clipboard";
import { useAccountState, useLedger } from "../hooks/account";
import { errorMessage, fmtUsd, shortAddr } from "../lib/format";
import { tx } from "../lib/txflow";
import type { WalletSession } from "../wallet/context";
import { Button, Sheet, Spinner, useToast } from "./ui";
import { DepositPanel } from "./DepositPanel";

export type FundsMode = "deposit" | "withdraw";
type Pending = { type: FundsMode; amount: string; hash?: string; nonce?: number; startedAt: number };

export function FundsSheet({ mode, onClose, session }: { mode: FundsMode | null; onClose(): void; session: WalletSession }) {
  const qc = useQueryClient();
  const toast = useToast();
  const chain = bridgeClient(config.network, config.arbitrumRpcUrl).chain;
  const key = `txgram:funds:${config.network.name}:${session.address.toLowerCase()}`;
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
  });
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState<string>(session.address);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const account = useAccountState(session.address);
  const ledger = useLedger(session.address);
  const bridge = useQuery({ queryKey: ["bridge", config.network.name, session.address],
    queryFn: () => readBridge(config.network, session.address, config.arbitrumRpcUrl),
    enabled: mode === "deposit", retry: 1, refetchInterval: mode === "deposit" ? 20_000 : false });

  useEffect(() => { setReview(false); setError(""); setAmount(""); setMessage(""); }, [mode]);
  useEffect(() => { if (pending) localStorage.setItem(key, JSON.stringify(pending)); else localStorage.removeItem(key); }, [key, pending]);
  useEffect(() => {
    if (!pending) return;
    const row = ledger.data?.data.find((r) => {
      if (r.delta.type !== pending.type) return false;
      if (pending.type === "withdraw") return Number(r.delta.nonce) === pending.nonce;
      return !!pending.hash && r.hash.toLowerCase() === pending.hash.toLowerCase();
    });
    if (!row) return;
    if (["completed", "success", "confirmed"].includes(row.delta.status?.toLowerCase() ?? "")) {
      setMessage(`${pending.type === "deposit" ? "Deposit credited" : "Withdrawal completed"}: ${row.delta.amount} USDC`);
      toast("success", pending.type === "deposit" ? "Deposit credited" : "Withdrawal completed");
      setPending(null);
      void qc.invalidateQueries({ queryKey: ["clearinghouse", session.address] });
      void qc.invalidateQueries({ queryKey: ["onboarding", session.address] });
    } else if (["failed", "rejected", "reverted"].includes(row.delta.status?.toLowerCase() ?? "")) {
      setError(`${pending.type} ${row.delta.status}. Check account activity.`);
      setPending(null);
    }
  }, [ledger.data, pending, qc, session.address, toast]);

  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["clearinghouse", session.address] }),
      qc.invalidateQueries({ queryKey: ["ledger", session.address] }),
      qc.invalidateQueries({ queryKey: ["onboarding", session.address] }),
      qc.invalidateQueries({ queryKey: ["bridge"] })]);
  };
  const copy = (text: string) => { copyText(text).then(() => toast("info", "Address copied"), () => setError("Could not copy address")); };
  const validateWithdraw = (withdrawable: string) => {
    if (!isAddress(destination) || destination.toLowerCase() === zeroAddress) throw new Error("Enter a valid Arbitrum destination address");
    withdrawalQuote(amount, withdrawable);
  };
  const submit = async () => {
    if (!mode || busy || pending) return;
    setError(""); setMessage("");
    if (mode === "withdraw" && !review) {
      try { validateWithdraw(account.data?.withdrawable ?? "0"); setReview(true); } catch (e) { setError(errorMessage(e)); }
      return;
    }
    setBusy(true);
    try {
      if (mode === "deposit") {
        // Switch the actual wallet before asking it to sign the Arbitrum permit domain.
        if (session.switchChain) await session.switchChain(chain.id);
        await depositUsdc(config.network, session.signer, amount, config.arbitrumRpcUrl, (hash) => {
          setPending({ type: "deposit", amount, hash, startedAt: Date.now() });
          setMessage("Deposit broadcast. Waiting for the transfer and TxFlow credit.");
        });
        setMessage("USDC transfer confirmed. Waiting for TxFlow to credit your trading account.");
      } else {
        const latest = await tx.info.clearinghouseState(session.address);
        validateWithdraw(latest.withdrawable);
        if (session.switchChain) await session.switchChain(chain.id);
        const nonce = nextNonce();
        try {
          await tx.withdrawUsdc(session.signer, destination as Address, amount, { signatureChainId: chain.id, nonce,
            onSigned: () => {
              const value = { type: "withdraw" as const, amount, nonce, startedAt: Date.now() };
              localStorage.setItem(key, JSON.stringify(value)); setPending(value);
            } });
        } catch (e) {
          if (!(e instanceof PendingExchangeError)) {
            // A protocol rejection is definitive. A transport failure after signing is ambiguous.
            if (e instanceof TxFlowError && e.body && typeof e.body === "object" && "status" in e.body) { localStorage.removeItem(key); setPending(null); }
            throw e;
          }
        }
        setPending({ type: "withdraw", amount, nonce, startedAt: Date.now() });
        setMessage("Withdrawal requested. Bridge settlement is pending; check Activity for completion.");
        setReview(false);
      }
      await refresh();
    } catch (e) {
      if (e instanceof DepositFailedError) setPending(null);
      setError(errorMessage(e));
    } finally { setBusy(false); }
  };
  const faucet = async () => {
    setBusy(true); setError("");
    try {
      const res = await requestFund(config.network, session.address) as { status?: string; message?: string };
      if (res.status !== "success") throw new Error(res.message ?? "Test faucet failed");
      setMessage("Test USDC requested. Your trading balance will update when credited.");
      await refresh();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return <Sheet open={!!mode} onClose={onClose} title={mode === "withdraw" ? "Withdraw USDC" : "Deposit USDC"}>
    <div className="flex flex-col gap-4 px-5 pb-6">
      {mode === "withdraw" && <div className="flex items-center justify-between text-xs"><span className="rounded-full border border-line-2 px-3 py-1.5">{chain.name}</span><span className="text-label-3">{config.network.name === "testnet" ? "Test funds only · no monetary value" : "USDC"}</span></div>}
      {pending && <div role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm"><span className="flex items-center gap-2 font-semibold text-warning"><Spinner /> {pending.type === "deposit" ? "Deposit pending" : "Withdrawal pending"}</span><p className="mt-2 text-label-2">{pending.amount} USDC · Check Activity for the final status.</p>{pending.hash && <a className="mt-2 inline-block text-primary underline" href={`${chain.blockExplorers.default.url}/tx/${pending.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>}</div>}
      {mode === "deposit" ? <>
        <DepositPanel session={session} onFaucet={faucet} busy={busy} blocked={!!pending}>
          <div className="rounded-xl border border-line bg-surface p-4"><p className="text-xs text-label-3">From connected wallet</p><p className="mt-1 font-mono text-sm">{shortAddr(session.address)} <span className="font-sans text-xs text-label-4">· {chain.name}</span></p><div className="mt-4 flex justify-between text-xs"><span className="text-label-3">Available USDC</span><span className="num">{bridge.data ? formatUnits(bridge.data.balance, 6) : "—"}</span></div></div>
          {bridge.isPending ? <p className="flex items-center gap-2 text-xs text-label-3"><Spinner /> Checking wallet USDC…</p> : bridge.isError ? <p className="text-xs text-sell">Wallet balance unavailable. <button className="underline" onClick={() => bridge.refetch()}>Retry</button></p> : null}
          <label className="text-xs text-label-3">Amount<div className="mt-2 flex items-center rounded-xl border border-line-2 bg-surface px-4"><input aria-label="USDC amount" inputMode="decimal" placeholder="0.00" className="num min-w-0 flex-1 bg-transparent py-4 text-2xl text-label" value={amount} disabled={busy || !!pending} onChange={(e) => { if (/^\d*\.?\d{0,6}$/.test(e.target.value)) setAmount(e.target.value); }} /><span>USDC</span></div></label>
          <p className="text-[11px] text-label-3">Minimum 5 USDC. Confirm the deposit signature in your wallet.</p>
          <Button className="h-12 w-full" loading={busy} disabled={!!pending || !amount || !bridge.data} onClick={submit}>Deposit USDC</Button>
          <details className="rounded-xl border border-line p-3 text-xs"><summary className="cursor-pointer text-label-3">Need USDC in this wallet?</summary><p className="mt-3 leading-relaxed text-label-3">Send USDC on {chain.name} to this wallet, then enter an amount above to deposit into your trading account.</p><p className="mt-2 select-all break-all font-mono text-[11px]">{session.address}</p><button className="mt-2 text-primary" onClick={() => copy(session.address)}>Copy wallet address</button>{bridge.data && <a href={`${chain.blockExplorers.default.url}/token/${bridge.data.token}`} target="_blank" rel="noreferrer" className="mt-3 block text-label-3 underline">Supported USDC contract · {shortAddr(bridge.data.token)} ↗</a>}</details>
        </DepositPanel>
      </> : <>
        <div className="rounded-xl bg-surface p-4"><p className="text-xs text-label-3">Withdrawable collateral</p><p className="num mt-1 text-2xl">{fmtUsd(account.data?.withdrawable)} <span className="text-sm text-label-3">USDC</span></p></div>
        <label className="text-xs text-label-3">Destination on {chain.name}<input aria-label="Withdrawal destination" className="mt-2 w-full rounded-xl border border-line-2 bg-surface p-3 font-mono text-xs text-label" value={destination} disabled={review || busy || !!pending} onChange={(e) => setDestination(e.target.value.trim())} /></label>
      </>}
      {mode === "withdraw" && <label className="text-xs text-label-3">Total to withdraw (fee included)<div className="mt-2 flex items-center rounded-xl border border-line-2 bg-surface px-4"><input aria-label="USDC amount" inputMode="decimal" placeholder="0.00" className="num min-w-0 flex-1 bg-transparent py-4 text-2xl text-label" value={amount} disabled={review || busy || !!pending} onChange={(e) => { if (/^\d*\.?\d{0,6}$/.test(e.target.value)) setAmount(e.target.value); }} /><span>USDC</span></div></label>}
      {mode === "withdraw" && <div className="flex flex-col gap-2 text-xs"><div className="flex justify-between text-label-3"><span>Withdrawal fee (included)</span><span>1 USDC</span></div><div className="flex justify-between"><span>Estimated received</span><span className="num">{Number(amount) >= 2 ? (Number(amount) - 1).toFixed(6) : "—"} USDC</span></div><div className="flex justify-between"><span>Total deducted</span><span className="num">{amount || "—"} USDC</span></div>{review && <p className="rounded-lg border border-warning/30 p-3 text-warning">Confirm a total deduction of {amount} USDC. Estimated {Number(amount) - 1} USDC to {destination} on {chain.name}. The bridge completes settlement after the withdrawal is accepted.</p>}</div>}
      {error && <p role="alert" className="break-words text-sm text-sell">{error}</p>}
      {message && <p role="status" className="text-sm text-primary">{message}</p>}
      {review && <button className="text-xs text-label-3 underline" disabled={busy} onClick={() => setReview(false)}>Edit withdrawal</button>}
      {mode === "withdraw" && <Button className="h-12 w-full" loading={busy} disabled={!!pending || !amount} onClick={submit}>{review ? "Confirm & sign withdrawal" : "Review withdrawal"}</Button>}
      <button className="text-xs text-label-3 underline" onClick={refresh}>Refresh balance & activity</button>
    </div>
  </Sheet>;
}
