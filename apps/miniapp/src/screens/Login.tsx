import { Logo, Wordmark } from "../components/Logo";
import { Button } from "../components/ui";
import { config } from "../config";
import { inTelegram } from "../lib/telegram";
import { useWallet } from "../wallet/context";

export function Login() {
  const { login, provider } = useWallet();
  return (
    <div className="flex h-full flex-col px-6 pt-[18vh] pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div className="flex flex-1 flex-col items-center text-center">
        <Logo size={72} />
        <Wordmark className="mt-5 text-4xl" />
        <p className="mt-3 text-label-2">Perpetual futures, right inside Telegram</p>
        <div className="mt-8 flex flex-wrap justify-center gap-2 text-xs text-label-3">
          {["Up to 50x leverage", "No gas fees", "Trade-only key, no withdrawals"].map((t) => (
            <span key={t} className="rounded-full border border-line-2 px-3 py-1">
              {t}
            </span>
          ))}
        </div>
      </div>
      <Button className="h-13 w-full text-base" onClick={login}>
        {provider === "dev" ? "Create test wallet" : inTelegram() ? "Continue with Telegram" : "Log in"}
      </Button>
      <p className="mt-3 text-center text-xs text-label-4">
        {provider === "dev"
          ? "Dev mode · the key is stored only in this browser"
          : "No wallet needed — one is created for your Telegram account"}
        {config.network.name === "testnet" && " · TxFlow testnet"}
      </p>
    </div>
  );
}
