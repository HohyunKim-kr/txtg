import type { Address } from "viem";
import type { Network } from "./config";
import type { ApproveAgentAction, ApproveBuilderFeeAction } from "./signing";

let lastNonce = 0;

/** Millisecond timestamp, strictly increasing within this process. */
export function nextNonce(): number {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return lastNonce;
}

// ---------------------------------------------------------------------------
// Account-signed
// ---------------------------------------------------------------------------

export function approveAgentAction(
  network: Network,
  agentAddress: Address,
  agentName: string,
  nonce = nextNonce(),
): ApproveAgentAction {
  return {
    type: "approveAgent",
    txflowNetwork: network.txflowNetwork,
    chainId: network.chainId,
    apiVersion: network.apiVersion,
    agentAddress,
    agentName,
    nonce,
  };
}

export function approveBuilderFeeAction(
  network: Network,
  builder: Address,
  maxFeeRate: string,
  nonce = nextNonce(),
): ApproveBuilderFeeAction {
  return {
    type: "approveBuilderFee",
    txflowNetwork: network.txflowNetwork,
    chainId: network.chainId,
    apiVersion: network.apiVersion,
    builder,
    maxFeeRate,
    nonce,
  };
}

// ---------------------------------------------------------------------------
// Agent-signed. Key order here IS the signed byte order — do not reorder.
// ---------------------------------------------------------------------------

export type Tif = "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
export type MarginMode = "cross" | "isolated";

export interface OrderBody {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: Tif } };
  c?: string;
  m?: MarginMode;
}

export interface OrderInput {
  asset: number;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly?: boolean;
  tif: Tif;
  cloid?: string;
  marginMode?: MarginMode;
}

export interface Builder {
  address: Address;
  /** Tenths of a basis point. */
  fee: number;
}

export function orderAction(orders: OrderInput[], builder?: Builder) {
  const body: OrderBody[] = orders.map((o) => {
    const ob: OrderBody = {
      a: o.asset,
      b: o.isBuy,
      p: o.price,
      s: o.size,
      r: o.reduceOnly ?? false,
      t: { limit: { tif: o.tif } },
    };
    if (o.cloid !== undefined) ob.c = o.cloid;
    if (o.marginMode !== undefined) ob.m = o.marginMode;
    return ob;
  });
  return {
    type: "order" as const,
    grouping: "na" as const,
    orders: body,
    ...(builder ? { builder: { b: builder.address, f: builder.fee } } : {}),
  };
}

export function cancelAction(cancels: { asset: number; oid: number }[]) {
  return { type: "cancel" as const, cancels: cancels.map((c) => ({ a: c.asset, o: c.oid })) };
}

export function updateLeverageAction(asset: number, leverage: number, marginMode: MarginMode) {
  return { type: "updateLeverage" as const, asset, leverage, marginMode };
}

export function updateMarginModeAction(asset: number, isCross: boolean) {
  return { type: "updateMarginMode" as const, asset, isCross };
}
