import {
  PrivyProvider,
  usePrivy,
  useSignTypedData,
  useWallets,
  type ConnectedWallet,
} from "@privy-io/react-auth";
import { useMemo, type ReactNode } from "react";
import type { Address, Hex } from "viem";
import { WalletContext, type WalletState } from "./context";

function chainIdOf(w: ConnectedWallet): number | undefined {
  const n = Number(w.chainId.split(":")[1]);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signTypedData } = useSignTypedData();

  const value = useMemo<WalletState>(() => {
    // Prefer the user's primary wallet; fall back to the embedded one.
    const primary = user?.wallet?.address?.toLowerCase();
    const wallet =
      wallets.find((w) => w.address.toLowerCase() === primary) ??
      wallets.find((w) => w.walletClientType === "privy") ??
      wallets[0];
    const embedded = wallet?.walletClientType === "privy";

    return {
      ready: ready && walletsReady,
      provider: "privy",
      session:
        authenticated && wallet
          ? {
              address: wallet.address as Address,
              kind: embedded ? "embedded" : "external",
              silent: embedded,
              // Sign under the wallet's own chain; TxFlow accepts it via signatureChainId.
              signatureChainId: chainIdOf(wallet),
              signer: {
                address: wallet.address as Address,
                async signTypedData(td) {
                  const { signature } = await signTypedData(td as never, {
                    address: wallet.address,
                    ...(embedded ? { uiOptions: { showWalletUIs: false } } : {}),
                  });
                  return signature as Hex;
                },
              },
            }
          : undefined,
      login: () => login(),
      logout: () => logout(),
    };
  }, [ready, walletsReady, authenticated, user, wallets, signTypedData, login, logout]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function PrivyWalletProvider({ appId, children }: { appId: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["telegram", "wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#8df885",
          logo: `${location.origin}/logo.svg`,
          walletChainType: "ethereum-only",
        },
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}
