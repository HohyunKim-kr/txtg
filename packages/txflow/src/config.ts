export type NetworkName = "testnet" | "mainnet";

export interface Network {
  name: NetworkName;
  /** `txflowNetwork` field and EIP-712 domain name. */
  txflowNetwork: "TxFlow-Testnet" | "TxFlow-Mainnet";
  chainId: number;
  apiVersion: number;
  httpUrl: string;
  wsUrl: string;
  /** Sent as `x-api-version` on every HTTP request. */
  apiVersionHeader: string;
}

export const NETWORKS: Record<NetworkName, Network> = {
  testnet: {
    name: "testnet",
    txflowNetwork: "TxFlow-Testnet",
    chainId: 2511,
    apiVersion: 1,
    httpUrl: "https://rpc.txflow-testnet.xyz",
    wsUrl: "wss://rpc.txflow-testnet.xyz/ws",
    apiVersionHeader: "2026-08-16",
  },
  mainnet: {
    name: "mainnet",
    txflowNetwork: "TxFlow-Mainnet",
    chainId: 869,
    apiVersion: 1,
    httpUrl: "https://rpc.txflow.com",
    wsUrl: "wss://rpc.txflow.com/ws",
    apiVersionHeader: "2026-08-16",
  },
};

/** Builder fee caps, in tenths of a basis point (`f`). */
export const BUILDER_FEE_CAP = { perp: 100, outcome: 1000 } as const;
