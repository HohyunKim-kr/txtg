import { useState } from "react";
import { config } from "../config";
import type { AccountState } from "../hooks/account";
import { fmtSigned, fmtUsd, shortAddr } from "../lib/format";
import { useWallet } from "../wallet/context";
import { Logo, Wordmark } from "./Logo";
import { Button, Sheet, useToast } from "./ui";

const KIND_LABEL = { embedded: "Telegram wallet", external: "External wallet", dev: "Dev wallet" } as const;

export function Header({ account }: { account: AccountState | undefined }) {
  const { session, logout } = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const value = account?.marginSummary.accountValue;
  const upnl = account?.assetPositions.reduce((s, p) => s + Number(p.position.unrealizedPnl), 0) ?? 0;

  return (
    <>
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <Wordmark />
          {config.network.name === "testnet" && (
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">TESTNET</span>
          )}
        </div>
        <button onClick={() => setOpen(true)} className="flex flex-col items-end rounded-lg px-2 py-1 active:bg-surface">
          <span className="num text-sm font-semibold">${fmtUsd(value)}</span>
          <span className="text-[10px] text-label-4">{session && shortAddr(session.address)}</span>
        </button>
      </header>

      <Sheet open={open} onClose={() => setOpen(false)} title="Account">
        <div className="flex flex-col gap-3 px-4 pb-6">
          <div className="rounded-xl bg-surface p-4">
            <div className="text-xs text-label-4">Account value</div>
            <div className="num mt-1 text-2xl font-bold">${fmtUsd(value)}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-label-4">Withdrawable</div>
                <div className="num text-label-2">${fmtUsd(account?.withdrawable)}</div>
              </div>
              <div>
                <div className="text-label-4">Unrealized PnL</div>
                <div className={`num ${upnl >= 0 ? "text-buy" : "text-sell"}`}>{fmtSigned(upnl)}</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <div className="flex items-center justify-between text-xs text-label-4">
              <span>{session && KIND_LABEL[session.kind]}</span>
              <span>{config.network.txflowNetwork}</span>
            </div>
            <div className="num mt-2 text-xs break-all text-label-2">{session?.address}</div>
            <Button
              variant="surface"
              className="mt-3 h-9 w-full text-sm"
              onClick={() => {
                navigator.clipboard.writeText(session!.address);
                toast("info", "Address copied");
              }}
            >
              Copy address
            </Button>
          </div>
          <p className="text-xs text-label-4">
            Deposit and withdraw with the same address in the TxFlow app (app.txflow.com). The trading key on this device cannot withdraw.
          </p>
          <Button variant="ghost" className="h-10 w-full text-sm text-sell" onClick={() => logout()}>
            Log out
          </Button>
        </div>
      </Sheet>
    </>
  );
}
