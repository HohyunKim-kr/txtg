import { encode } from "@msgpack/msgpack";
import {
  concat,
  hexToBytes,
  keccak256,
  numberToHex,
  parseSignature,
  zeroAddress,
  type Address,
  type Hex,
  type LocalAccount,
  type TypedDataDefinition,
} from "viem";
import type { Network } from "./config";

/**
 * Anything that can produce an EIP-712 signature for the account key:
 * a viem account, a Privy embedded wallet, an injected wallet.
 */
export interface AccountSigner {
  address: Address;
  signTypedData(typedData: TypedDataDefinition): Promise<Hex>;
}

export interface Signature {
  r: Hex;
  s: Hex;
  v: number;
}

export interface Envelope<A> {
  action: A;
  signature: Signature;
  nonce: number;
  vaultAddress: Address | null;
  signatureChainId: number | null;
}

export function domain(network: Network, chainId = network.chainId) {
  return {
    name: network.txflowNetwork,
    version: String(network.apiVersion),
    chainId,
    verifyingContract: zeroAddress,
  } as const;
}

export function splitSignature(sig: Hex): Signature {
  const { r, s, v, yParity } = parseSignature(sig);
  return { r, s, v: v !== undefined ? Number(v) : 27 + yParity };
}

// ---------------------------------------------------------------------------
// Flow 1 — direct EIP-712, signed by the account key
// ---------------------------------------------------------------------------

const DIRECT_TYPES = {
  approveAgent: {
    ApproveAgent: [
      { name: "txflowNetwork", type: "string" },
      { name: "chainId", type: "uint32" },
      { name: "apiVersion", type: "uint32" },
      { name: "agentAddress", type: "address" },
      { name: "agentName", type: "string" },
      { name: "nonce", type: "uint64" },
    ],
  },
  approveBuilderFee: {
    ApproveBuilderFee: [
      { name: "txflowNetwork", type: "string" },
      { name: "chainId", type: "uint32" },
      { name: "apiVersion", type: "uint32" },
      { name: "builder", type: "address" },
      { name: "maxFeeRate", type: "string" },
      { name: "nonce", type: "uint64" },
    ],
  },
} as const;

export interface ApproveAgentAction {
  type: "approveAgent";
  txflowNetwork: string;
  chainId: number;
  apiVersion: number;
  agentAddress: Address;
  agentName: string;
  nonce: number;
}

export interface ApproveBuilderFeeAction {
  type: "approveBuilderFee";
  txflowNetwork: string;
  chainId: number;
  apiVersion: number;
  builder: Address;
  /** Percentage string, e.g. `"0.05%"`. */
  maxFeeRate: string;
  nonce: number;
}

export type DirectAction = ApproveAgentAction | ApproveBuilderFeeAction;

export function directTypedData(
  network: Network,
  action: DirectAction,
  signatureChainId?: number,
): TypedDataDefinition {
  const { type, ...message } = action;
  const types = DIRECT_TYPES[type];
  return {
    domain: domain(network, signatureChainId),
    types,
    primaryType: Object.keys(types)[0]!,
    message,
  } as TypedDataDefinition;
}

export async function signDirect<A extends DirectAction>(
  network: Network,
  signer: AccountSigner,
  action: A,
  signatureChainId?: number,
): Promise<Envelope<A>> {
  const sig = await signer.signTypedData(directTypedData(network, action, signatureChainId));
  return {
    action,
    signature: splitSignature(sig),
    nonce: action.nonce,
    vaultAddress: null,
    signatureChainId: signatureChainId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Flow 2 — agent signing (MessagePack → connectionId → Agent EIP-712)
// ---------------------------------------------------------------------------

const AGENT_TYPES = {
  Agent: [
    { name: "txflowNetwork", type: "string" },
    { name: "chainId", type: "uint32" },
    { name: "apiVersion", type: "uint32" },
    { name: "connectionId", type: "bytes32" },
  ],
} as const;

/** Actions whose MessagePack preimage keeps the `type` tag. */
const TAGGED_ACTIONS = new Set(["claimBuilderRewards"]);

/** Addresses inside an action body are hashed as 20 raw bytes, not hex strings. */
function binaryAddresses(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  const builder = out.builder as { b: Hex; f: number } | undefined;
  if (builder) out.builder = { b: hexToBytes(builder.b), f: builder.f };
  if (typeof out.vaultAddress === "string") out.vaultAddress = hexToBytes(out.vaultAddress as Hex);
  return out;
}

export function actionMsgpack(action: { type: string }): Uint8Array {
  const { type, ...body } = action;
  const preimage = TAGGED_ACTIONS.has(type) ? { type, ...body } : body;
  return encode(binaryAddresses(preimage), { ignoreUndefined: true });
}

export function connectionId(action: { type: string }, nonce: number, vaultAddress: Address | null = null): Hex {
  const vaultFlag = vaultAddress ? concat(["0x01", vaultAddress]) : "0x00";
  return keccak256(
    concat([
      actionMsgpack(action),
      hexToBytes(numberToHex(BigInt(nonce), { size: 8 })),
      hexToBytes(vaultFlag),
    ]),
  );
}

export function agentTypedData(network: Network, connId: Hex): TypedDataDefinition {
  return {
    domain: domain(network),
    types: AGENT_TYPES,
    primaryType: "Agent",
    message: {
      txflowNetwork: network.txflowNetwork,
      chainId: network.chainId,
      apiVersion: network.apiVersion,
      connectionId: connId,
    },
  } as TypedDataDefinition;
}

export async function signAgent<A extends { type: string }>(
  network: Network,
  agent: Pick<LocalAccount, "signTypedData">,
  action: A,
  nonce: number,
): Promise<Envelope<A>> {
  const sig = await agent.signTypedData(agentTypedData(network, connectionId(action, nonce)) as never);
  return { action, signature: splitSignature(sig), nonce, vaultAddress: null, signatureChainId: null };
}
