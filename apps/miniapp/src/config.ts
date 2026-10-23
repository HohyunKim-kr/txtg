import { BUILDER_FEE_CAP, NETWORKS, type NetworkName } from "@txgram/txflow";
import { isAddress, type Address } from "viem";

const env = import.meta.env;

const networkName = (env.VITE_NETWORK === "mainnet" ? "mainnet" : "testnet") as NetworkName;

const builderAddress = env.VITE_BUILDER_ADDRESS as string | undefined;
const builderFee = Number(env.VITE_BUILDER_FEE ?? 10);

export const config = {
  network: NETWORKS[networkName],
  privyAppId: (env.VITE_PRIVY_APP_ID as string | undefined) || undefined,
  builder:
    builderAddress && isAddress(builderAddress)
      ? {
          address: builderAddress as Address,
          fee: Math.min(builderFee, BUILDER_FEE_CAP.perp),
          maxFeeRate: (env.VITE_BUILDER_MAX_FEE_RATE as string | undefined) || "0.05%",
        }
      : undefined,
  /** One label per account; a new device rebinds it and retires the old key. */
  agentName: "txgram-tma",
};
