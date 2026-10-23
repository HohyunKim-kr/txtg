import type { ReactNode } from "react";
import { config } from "../config";
import { DevWalletProvider } from "./DevWallet";
import { PrivyWalletProvider } from "./PrivyWallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  if (config.privyAppId) return <PrivyWalletProvider appId={config.privyAppId}>{children}</PrivyWalletProvider>;
  if (config.network.name !== "testnet") throw new Error("VITE_PRIVY_APP_ID is required on mainnet");
  return <DevWalletProvider>{children}</DevWalletProvider>;
}
