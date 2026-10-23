import { useMemo, useState, type ReactNode } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { WalletContext, type WalletState } from "./context";

const KEY = "txgram:dev-wallet";

/**
 * Testnet-only wallet kept in localStorage, for running the app without a
 * Privy app id. Never use it with real funds.
 */
export function DevWalletProvider({ children }: { children: ReactNode }) {
  const [pk, setPk] = useState<Hex | null>(() => localStorage.getItem(KEY) as Hex | null);

  const value = useMemo<WalletState>(() => {
    const account = pk ? privateKeyToAccount(pk) : undefined;
    return {
      ready: true,
      provider: "dev",
      session: account && { address: account.address, kind: "dev", signer: account, silent: true },
      login() {
        const key = generatePrivateKey();
        localStorage.setItem(KEY, key);
        setPk(key);
      },
      async logout() {
        localStorage.removeItem(KEY);
        setPk(null);
      },
    };
  }, [pk]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
