import type { AccountSigner } from "@txgram/txflow";
import { createContext, useContext } from "react";
import type { Address } from "viem";

export type WalletKind = "embedded" | "external" | "dev";

export interface WalletSession {
  address: Address;
  kind: WalletKind;
  signer: AccountSigner;
  /** Domain chain to sign under (external wallets force their connected chain). */
  signatureChainId?: number;
  /** Signs without showing a prompt. */
  silent: boolean;
  switchChain?(chainId: number): Promise<void>;
}

export interface WalletState {
  ready: boolean;
  session?: WalletSession;
  login(): void;
  logout(): Promise<void>;
  /** Which backend is wired: Privy, or the local dev wallet. */
  provider: "privy" | "dev";
}

export const WalletContext = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
