import type { ReactNode } from "react";
import { Wordmark } from "../components/Logo";
import { Button, Spinner, useToast } from "../components/ui";
import { config } from "../config";
import type { useOnboarding } from "../hooks/onboarding";
import { errorMessage, shortAddr } from "../lib/format";
import { useWallet } from "../wallet/context";

type Onboarding = ReturnType<typeof useOnboarding>;

function Step({
  n,
  title,
  desc,
  done,
  active,
  action,
}: {
  n: number;
  title: string;
  desc: ReactNode;
  done: boolean;
  active: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${active ? "border-primary/40 bg-surface" : "border-line bg-fill"}`}>
      <div className="flex items-start gap-3">
        <div
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done ? "bg-primary text-on-primary" : active ? "bg-surface-3 text-primary" : "bg-surface text-label-4"
          }`}
        >
          {done ? "✓" : n}
        </div>
        <div className="flex-1">
          <div className={`font-semibold ${done ? "text-label-3" : ""}`}>{title}</div>
          <div className="mt-1 text-sm text-label-3">{desc}</div>
          {active && action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export function Onboarding({ ob }: { ob: Onboarding }) {
  const { session, logout } = useWallet();
  const toast = useToast();
  const s = ob.state.data!;
  const silent = session!.silent;
  const run = (m: { mutateAsync(): Promise<unknown> }, ok: string) =>
    m.mutateAsync().then(
      () => toast("success", ok),
      (e) => toast("error", errorMessage(e)),
    );

  const needBuilder = !!config.builder && !s.builderOk;
  const busy = ob.approveBuilder.isPending || ob.enableTrading.isPending;

  // Silent (embedded / dev) wallets: one tap signs everything left.
  const startAll = async () => {
    try {
      if (needBuilder) await ob.approveBuilder.mutateAsync();
      await ob.enableTrading.mutateAsync();
      toast("success", "Trading enabled");
    } catch (e) {
      toast("error", errorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col px-5 pt-6 pb-[calc(20px+env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Wordmark />
        <button onClick={logout} className="text-xs text-label-4">
          {shortAddr(session!.address)} · Log out
        </button>
      </div>
      <h1 className="mt-8 text-2xl font-bold">Get ready to trade</h1>
      <p className="mt-1 text-sm text-label-3">One-time setup. After this, orders go out without signing prompts.</p>

      <div className="mt-6 flex flex-col gap-3">
        <Step
          n={1}
          title="Deposit USDC"
          done={s.funded}
          active={!s.funded}
          desc={
            config.network.name === "testnet"
              ? "Get free testnet USDC."
              : "Deposit USDC to this address from the TxFlow app."
          }
          action={
            config.network.name === "testnet" ? (
              <Button className="h-10 w-full" loading={ob.faucet.isPending} onClick={() => run(ob.faucet, "Test USDC received")}>
                Get test USDC
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <code className="num flex-1 truncate rounded-lg bg-bg px-3 py-2 text-xs">{session!.address}</code>
                <Button variant="surface" className="h-9 px-3 text-sm" onClick={() => navigator.clipboard.writeText(session!.address)}>
                  Copy
                </Button>
                <Button variant="ghost" className="h-9 px-2 text-sm" onClick={() => ob.refresh()}>
                  Check
                </Button>
              </div>
            )
          }
        />
        {config.builder && (
          <Step
            n={2}
            title="Approve fee"
            done={s.builderOk}
            active={s.funded && !s.builderOk && !silent}
            desc={
              <>
                Allow txgram orders to carry a builder fee of up to <b className="text-label-2">{config.builder.maxFeeRate}</b>. The
                actual charge is {config.builder.fee / 1000}% per order, and you can revoke it at any time.
              </>
            }
            action={
              <Button className="h-10 w-full" loading={ob.approveBuilder.isPending} onClick={() => run(ob.approveBuilder, "Fee approved")}>
                Sign with wallet
              </Button>
            }
          />
        )}
        <Step
          n={config.builder ? 3 : 2}
          title="Enable trading"
          done={s.agentOk}
          active={s.funded && !needBuilder && !s.agentOk && !silent}
          desc="Creates and registers a trading key on this device. It can place orders but can never withdraw."
          action={
            <Button className="h-10 w-full" loading={ob.enableTrading.isPending} onClick={() => run(ob.enableTrading, "Trading enabled")}>
              Sign with wallet
            </Button>
          }
        />
      </div>

      <div className="flex-1" />
      {silent && s.funded && (
        <Button className="h-13 w-full text-base" loading={busy} onClick={startAll}>
          {busy ? "Registering…" : "Start trading"}
        </Button>
      )}
      {ob.state.isFetching && (
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-label-4">
          <Spinner className="size-3" /> Checking status
        </div>
      )}
    </div>
  );
}
