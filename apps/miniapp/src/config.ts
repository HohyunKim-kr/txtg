import { BUILDER_FEE_CAP, NETWORKS, type NetworkName } from "@txgram/txflow";
import { isAddress, type Address } from "viem";

const env = import.meta.env;

const networkName = (env.VITE_NETWORK === "mainnet" ? "mainnet" : "testnet") as NetworkName;

const builderAddress = env.VITE_BUILDER_ADDRESS as string | undefined;
const builderFee = Number(env.VITE_BUILDER_FEE ?? 10);
const builderCap = (env.VITE_BUILDER_MAX_FEE_RATE as string | undefined) || "0.05%";
if (builderAddress && (!isAddress(builderAddress) || /^0x0{40}$/i.test(builderAddress))) throw new Error("VITE_BUILDER_ADDRESS must be a valid non-zero address");
if (builderAddress && (!Number.isInteger(builderFee) || builderFee < 0 || builderFee > BUILDER_FEE_CAP.perp)) throw new Error("VITE_BUILDER_FEE must be an integer from 0 to 100");
if (builderAddress && (!/^\d+(\.\d+)?%$/.test(builderCap) || Number(builderCap.slice(0, -1)) < builderFee / 1000 || Number(builderCap.slice(0, -1)) > 1 || Number(builderCap.slice(0, -1)) <= 0)) throw new Error("Builder approval cap must cover the fee and be at most 1%");

export const config = {
  network: NETWORKS[networkName],
  privyAppId: (env.VITE_PRIVY_APP_ID as string | undefined) || undefined,
  arbitrumRpcUrl: (env.VITE_ARBITRUM_RPC_URL as string | undefined) || undefined,
  builder:
    builderAddress && isAddress(builderAddress)
      ? {
          address: builderAddress as Address,
          fee: Math.min(builderFee, BUILDER_FEE_CAP.perp),
          maxFeeRate: builderCap,
        }
      : undefined,
  /** One label per account; a new device rebinds it and retires the old key. */
  agentName: "txgram-tma",
};
