import { isAddress, zeroAddress, type Address } from "viem";
import { TXFLOW_USDC } from "./actions";
import type { Network } from "./config";

export interface RelayToken {
  symbol: string; display_symbol: string; name: string; token_address: string;
  dst_token?: string; decimals: number; deposit_fee: string; min_amount: string; max_amount: string; deposit_enabled: boolean;
}
export interface RelayNetwork {
  chain: string; chain_name: string; chain_id: string; chain_type: string;
  deposit_enabled: boolean; deposit_eta_minutes: number; support_memo: boolean; tokens: RelayToken[];
}
export interface DepositRoute { network: RelayNetwork; token: RelayToken }
export interface RelayAddress { deposit_address: string; memo?: string | null }

async function relayRequest<T>(network: Network, path: string, body?: unknown): Promise<T> {
  const host = network.name === "mainnet" ? "https://api-bridge.txflow.com" : "https://devnet-bridge.txflow.net";
  let response: Response;
  try {
    response = await fetch(`${host}/api/v1/bridge/${path}`, {
      method: body ? "POST" : "GET", signal: AbortSignal.timeout(15_000),
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
  } catch { throw new Error("Deposit address service unavailable. Retry or deposit from your connected wallet."); }
  if (!response.ok) throw new Error(`Deposit address service unavailable (${response.status}). Try again later.`);
  let payload: { code: number; data: T; message?: string };
  try { payload = await response.json(); } catch { throw new Error("Invalid response from deposit address service"); }
  if (payload.code !== 0 || !payload.data) throw new Error(payload.message || "Deposit address service unavailable");
  return payload.data;
}

/** Only routes that credit the actual USDC trading collateral, rather than a spot wrapper. */
export function collateralRoutes(networks: RelayNetwork[]): DepositRoute[] {
  return networks.flatMap((network) => !network.deposit_enabled || !["evm", "solana"].includes(network.chain_type) || network.chain === "txflow" ? [] :
    network.tokens.filter((token) => token.deposit_enabled && token.display_symbol === "USDC"
      && token.dst_token?.toLowerCase() === `usdc:${TXFLOW_USDC.toLowerCase()}`
      && Number.isFinite(Number(token.min_amount)) && Number(token.min_amount) > 0
      && Number.isFinite(Number(token.max_amount)) && Number(token.max_amount) >= Number(token.min_amount)
      && token.deposit_fee !== "" && Number.isFinite(Number(token.deposit_fee)) && Number(token.deposit_fee) >= 0)
      .map((token) => ({ network, token })));
}
export async function depositRoutes(network: Network): Promise<DepositRoute[]> {
  const data = await relayRequest<{ networks: RelayNetwork[] }>(network, "networks");
  if (!Array.isArray(data.networks)) throw new Error("Invalid deposit networks response");
  return collateralRoutes(data.networks);
}
export async function depositAddress(network: Network, route: DepositRoute, user: Address): Promise<RelayAddress> {
  if (!isAddress(user) || user.toLowerCase() === zeroAddress) throw new Error("Invalid destination account");
  if (!collateralRoutes([route.network]).some((r) => r.token.symbol === route.token.symbol)) throw new Error("This deposit route is unavailable");
  const result = await relayRequest<RelayAddress>(network, "deposit-address", {
    channel_id: 0, src_chain: route.network.chain, dst_chain: "txflow", dst_address: user, symbol: route.token.symbol,
  });
  const valid = route.network.chain_type === "evm"
    ? isAddress(result.deposit_address) && result.deposit_address.toLowerCase() !== zeroAddress
    : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(result.deposit_address);
  if (!valid || (route.network.support_memo && !result.memo)) throw new Error("Deposit service returned an invalid address or missing memo");
  return result;
}
