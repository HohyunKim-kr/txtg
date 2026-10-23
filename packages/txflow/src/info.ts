import type { Address } from "viem";
import type { Network } from "./config";
import { info } from "./http";

export interface PerpMarket {
  name: string;
  baseCurrency: string;
  quoteCurrency: string;
  szDecimals: number;
  maxLeverage: number;
  index: number;
  priceTick: string;
  bookTicks: string[];
  maxLimitOrderSize: number;
  maxMarketOrderSize: number;
  haltTrading: boolean;
  onlyIsolated: boolean;
  delisted: boolean;
}

export interface BookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface L2Book {
  coin: string;
  time: number;
  /** [bids, asks], best first. */
  levels: [BookLevel[], BookLevel[]];
}

export interface Position {
  asset: string;
  coin: string;
  szi: string;
  entryPx: string | null;
  markPx: string | null;
  liquidationPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  marginUsed: string;
  maxLeverage: number;
  leverage: { type: string; value: number };
}

export interface MarginSummary {
  accountValue: string;
  totalMarginUsed: string;
  totalNtlPos: string;
  totalRawUsd: string;
}

export interface ClearinghouseState {
  assetPositions: { position: Position; type: string }[];
  marginSummary: MarginSummary;
  crossMarginSummary: MarginSummary;
  withdrawable: string;
  time: number;
}

export interface OpenOrder {
  asset: number;
  coin: string;
  oid: number;
  side: "B" | "A";
  limitPx: string;
  sz: string;
  origSz: string;
  orderType: string;
  reduceOnly: boolean;
  tif: string;
  timestamp: number;
  cloid?: string | null;
  marginMode?: string | null;
}

export interface ActiveAssetData {
  coin: string;
  leverage: { type: string; value: number; mode?: string };
  markPx: string;
  /** [buy, sell] */
  maxTradeSzs: [string, string];
  /** [buy, sell] */
  availableToTrade: [string, string];
  onlyIsolated: boolean;
}

export interface AssetCtx {
  funding: string;
  openInterest: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  lastPrice: string;
  nextFundingTime: number;
}

export interface AssetCtxInfo {
  coin: string;
  instrumentId: number;
  dayNtlVlm: string;
  prevDayPx: string;
  lastPrice: string;
  markPx: string;
  oraclePx: string;
  nodeCtx: AssetCtx;
}

export interface MaxBuilderFee {
  /** Tenths of a basis point. */
  maxFeeRate: number;
  status: "ACTIVE" | "REVOKED" | "NONE";
}

export interface BuilderState {
  accruedRewards: string;
  claimableRewards: string;
  claimedRewards: string;
  /** Fees accrue only while the builder's perp account holds ≥ 100 USDC. */
  eligible: boolean;
  perpsAccountValue: string;
  activeUserCount: number;
}

export function createInfoClient(network: Network) {
  const q = <T>(body: Record<string, unknown>) => info<T>(network, body);
  return {
    perpMeta: () => q<{ universe: PerpMarket[] }>({ type: "perpMeta" }).then((d) => d.universe),
    l2Book: (asset: number) => q<L2Book>({ type: "l2Book", coin: String(asset) }),
    activeAssetCtx: (asset: number) => q<AssetCtxInfo>({ type: "activeAssetCtx", coin: String(asset) }),
    clearinghouseState: (user: Address) =>
      q<ClearinghouseState>({ type: "clearinghouseState", user, accountType: "perp" }),
    frontendOpenOrders: (user: Address) => q<OpenOrder[]>({ type: "frontendOpenOrders", user }),
    activeAssetData: (user: Address, asset: number) =>
      q<ActiveAssetData>({ type: "activeAssetData", user, coin: String(asset) }),
    approvedAgents: (user: Address) =>
      q<{ agents: { agentAddress: string; agentName: string }[] }>({ type: "approvedAgents", user }).then(
        (d) => d.agents ?? [],
      ),
    maxBuilderFee: (user: Address, builder: Address) =>
      q<MaxBuilderFee>({ type: "maxBuilderFee", user, builder }),
    approveAgentEligibility: (user: Address) =>
      q<{ eligible: boolean; reason?: string }>({ type: "approveAgentEligibility", user }),
    geoCheck: () => q<{ geoBlock: boolean }>({ type: "geoCheck" }),
    builderState: (builder: Address) => q<BuilderState>({ type: "builderState", user: builder }),
  };
}

export type InfoClient = ReturnType<typeof createInfoClient>;
