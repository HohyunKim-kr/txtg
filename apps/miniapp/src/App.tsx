import type { ReactNode } from "react";
import { Wordmark } from "./components/Logo";
import { Button, Spinner } from "./components/ui";
import { useOnboarding } from "./hooks/onboarding";
import { errorMessage } from "./lib/format";
import { Login } from "./screens/Login";
import { Onboarding } from "./screens/Onboarding";
import { Trade } from "./screens/Trade";
import { useWallet } from "./wallet/context";

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">{children}</div>;
}

export function App() {
  const wallet = useWallet();
  const ob = useOnboarding(wallet.session);

  if (!wallet.ready) {
    return (
      <Centered>
        <Wordmark className="text-3xl" />
        <Spinner className="size-5 text-primary" />
      </Centered>
    );
  }
  if (!wallet.session) return <Login />;

  if (ob.state.isPending) {
    return (
      <Centered>
        <Spinner className="size-6 text-primary" />
        <span className="text-sm text-label-3">Checking account</span>
      </Centered>
    );
  }
  if (ob.state.isError) {
    return (
      <Centered>
        <span className="text-sm text-sell">{errorMessage(ob.state.error)}</span>
        <Button variant="surface" className="h-10 px-5" onClick={() => ob.refresh()}>
          Retry
        </Button>
      </Centered>
    );
  }

  const s = ob.state.data;
  if (s.geoBlocked) {
    return (
      <Centered>
        <span className="text-4xl">🌐</span>
        <span className="font-semibold">Trading is not available in your region</span>
        <span className="text-sm text-label-3">You are connecting from a region TxFlow restricts.</span>
      </Centered>
    );
  }
  if (!s.funded || !s.builderOk || !s.agentOk || !s.agent) return <Onboarding ob={ob} />;

  return <Trade session={wallet.session} agent={s.agent} />;
}
