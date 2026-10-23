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
  markPx?: string | null;
  liquidationPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  marginUsed: string;
  maxLeverage: number;
  leverage: { type: string; value: number };
}

export interface Page<T> { data: T[]; hasMore: boolean; total?: number }
export interface UserFill { tid: number; oid: number; instrumentId: number; coin: string; symbol?: string; side: string; px: string; sz: string; time: number; closedPnl: string; fee: string; dir: string; tradeSide?: string }
export interface LedgerUpdate { hash: string; time: number; delta: { type: string; amount: string; status?: string; fee?: string; nonce?: number; address?: string; chain?: string; txflowHash?: string } }
export interface Candle { t: number; T: number; o: string; h: string; l: string; c: string; v: string }
export interface MarketStats { instrumentId: number; coin: string; lastPrice: string; prevDayPx: string; dayNtlVlm: string }
export interface BridgeSettings { bridge2_contract_address: Address; withdraw_delay_amount?: string; withdraw_delay_time?: string }

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
  isTrigger?: boolean;
  triggerPx?: string;
}

export interface TpslOrder { asset: string; coin: string; side: "B" | "A"; quantity: string; tpOid: string; slOid: string; tpTriggerPrice: string; slTriggerPrice: string; tpOrderPrice: string; slOrderPrice: string; marginMode: string; createTime: number }

/** The live API serves position TP/SL separately from frontendOpenOrders. */
export function mergeOpenOrders(orders: OpenOrder[], protection: TpslOrder[]): OpenOrder[] {
  const merged = new Map(orders.map((o) => [Number(o.oid), o]));
  for (const p of protection) for (const kind of ["tp", "sl"] as const) {
    const oid = Number(p[kind === "tp" ? "tpOid" : "slOid"]);
    if (!Number.isSafeInteger(oid) || oid <= 0 || merged.has(oid)) continue;
    const triggerPx = p[kind === "tp" ? "tpTriggerPrice" : "slTriggerPrice"];
    merged.set(oid, { asset: Number(p.asset), coin: p.coin, oid, side: p.side, limitPx: triggerPx, triggerPx,
      sz: p.quantity, origSz: p.quantity, orderType: kind === "tp" ? "Take profit" : "Stop loss", reduceOnly: true,
      tif: "FrontendMarket", timestamp: p.createTime, marginMode: p.marginMode, isTrigger: true });
  }
  return [...merged.values()];
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
    marketStats: () => q<{ assetCtxs: MarketStats[] }>({ type: "webData2", user: "0x0000000000000000000000000000000000000001" }).then((d) => d.assetCtxs),
    l2Book: (asset: number) => q<L2Book>({ type: "l2Book", coin: String(asset) }),
    activeAssetCtx: (asset: number) => q<AssetCtxInfo>({ type: "activeAssetCtx", coin: String(asset) }),
    clearinghouseState: (user: Address) =>
      q<ClearinghouseState>({ type: "clearinghouseState", user, accountType: "perp" }),
    frontendOpenOrders: (user: Address) => q<OpenOrder[]>({ type: "frontendOpenOrders", user }),
    tpslOrders: (user: Address) => q<TpslOrder[]>({ type: "tpslOrders", user }),
    openOrders: async (user: Address) => {
      const [orders, protection] = await Promise.all([q<OpenOrder[]>({ type: "frontendOpenOrders", user }), q<TpslOrder[]>({ type: "tpslOrders", user })]);
      return mergeOpenOrders(orders, protection);
    },
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
    settings: () => q<BridgeSettings>({ type: "settings" }),
    userFills: (user: Address) => q<Page<UserFill>>({ type: "userFills", user, accountType: ["perp"], limit: 30 }),
    ledger: (user: Address) => q<Page<LedgerUpdate>>({ type: "userNonFundingLedgerUpdates", user, limit: 30 }),
    candles: (asset: number, interval: "1m" | "15m" | "1h", startTime: number, endTime: number) =>
      q<Candle[]>({ type: "candleSnapshot", req: { coin: String(asset), interval, startTime, endTime } }),
    builderState: (builder: Address) => q<BuilderState>({ type: "builderState", user: builder }),
  };
}

export type InfoClient = ReturnType<typeof createInfoClient>;
