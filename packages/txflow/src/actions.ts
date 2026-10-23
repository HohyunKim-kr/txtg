import { formatUnits, isAddress, parseUnits, zeroAddress, type Address } from "viem";
import type { Network } from "./config";
import type { ApproveAgentAction, ApproveBuilderFeeAction, WithdrawAction } from "./signing";

/** TxFlow-side USDC, as documented by withdraw3 (not the Arbitrum ERC-20). */
export const TXFLOW_USDC: Address = "0xd04f0d19E8FbA49cfA541E272F9C60a2ad720464";
export const WITHDRAW_FEE = "1";

export function usdcUnits(amount: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(amount)) throw new Error("Enter a USDC amount with up to 6 decimals");
  const units = parseUnits(amount, 6);
  if (units <= 0n) throw new Error("Amount must be greater than zero");
  return units;
}

/** Verified on testnet: withdraw3.amount includes its 1 USDC fee (ledger amount is net). */
export function withdrawalQuote(amount: string, withdrawable: string) {
  const debit = usdcUnits(amount);
  if (debit < 2_000_000n) throw new Error("Minimum withdrawal is 2 USDC including the fee");
  if (debit > parseUnits(withdrawable, 6)) throw new Error("Withdrawal exceeds withdrawable funds");
  return { debit: formatUnits(debit, 6), fee: WITHDRAW_FEE, receive: formatUnits(debit - 1_000_000n, 6) };
}

export function withdrawAction(network: Network, destination: Address, amount: string, signatureChainId: number, nonce = nextNonce()): WithdrawAction {
  if (!isAddress(destination) || destination.toLowerCase() === zeroAddress) throw new Error("Enter a valid destination address");
  if (usdcUnits(amount) < 2_000_000n) throw new Error("Minimum withdrawal is 2 USDC");
  if (!Number.isSafeInteger(signatureChainId) || signatureChainId <= 0) throw new Error("Invalid signing chain");
  return { type: "withdraw3", txflowNetwork: network.txflowNetwork, chainId: network.chainId, apiVersion: network.apiVersion,
    destination, signatureChainId: signatureChainId.toString(16), tokenAddress: TXFLOW_USDC, amount, nonce };
}

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
  t: { limit: { tif: Tif } } | { trigger: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" } };
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
  trigger?: { isMarket: boolean; triggerPx: string; tpsl: "tp" | "sl" };
}

export interface Builder {
  address: Address;
  /** Tenths of a basis point. */
  fee: number;
}

export type OrderGrouping = "na" | "positionTpsl" | "normalTpsl" | "normalTrigger";
export function orderAction(orders: OrderInput[], builder?: Builder, grouping: OrderGrouping = "na") {
  const body: OrderBody[] = orders.map((o) => {
    const ob: OrderBody = {
      a: o.asset,
      b: o.isBuy,
      p: o.price,
      s: o.size,
      r: o.reduceOnly ?? false,
      t: o.trigger ? { trigger: o.trigger } : { limit: { tif: o.tif } },
    };
    if (o.cloid !== undefined) ob.c = o.cloid;
    if (o.marginMode !== undefined) ob.m = o.marginMode;
    return ob;
  });
  return {
    type: "order" as const,
    grouping,
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
