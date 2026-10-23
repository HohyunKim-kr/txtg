import {
  createPublicClient, decodeEventLog, erc20Abi, hashDomain, http, isAddress, parseAbi, type Address, type Hex,
} from "viem";
import { arbitrum, arbitrumSepolia } from "viem/chains";
import { usdcUnits } from "./actions";
import type { Network } from "./config";
import { info } from "./http";
import type { BridgeSettings } from "./info";
import { splitSignature, type AccountSigner } from "./signing";

const bridgeAbi = parseAbi(["function usdcToken() view returns (address)"]);
const permitAbi = parseAbi([
  "function nonces(address) view returns (uint256)", "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
]);
const permitTypes = { Permit: [
  { name: "owner", type: "address" }, { name: "spender", type: "address" },
  { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
] } as const;

export class DepositFailedError extends Error {}

export function bridgeClient(network: Network, rpcUrl?: string) {
  const chain = network.name === "mainnet" ? arbitrum : arbitrumSepolia;
  return createPublicClient({ chain, transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }) });
}

export async function readBridge(network: Network, user: Address, rpcUrl?: string) {
  const client = bridgeClient(network, rpcUrl);
  const settings = await info<BridgeSettings>(network, { type: "settings" });
  const bridge = settings.bridge2_contract_address;
  if (!isAddress(bridge)) throw new Error("TxFlow returned an invalid bridge address");
  // Read the token from Bridge2 itself: testnet uses a different token from Circle's faucet USDC.
  const token = await client.readContract({ address: bridge, abi: bridgeAbi, functionName: "usdcToken" });
  const [balance, name] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [user] }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
  ]);
  return { client, bridge, token, balance, name, settings };
}

/** Relayed EIP-2612 deposit: exact allowance, chain-bound signature, no app custody. */
export async function depositUsdc(network: Network, signer: AccountSigner, amount: string, rpcUrl?: string, onBroadcast?: (hash: Hex) => void) {
  const value = usdcUnits(amount);
  if (value < 5_000_000n) throw new Error("Minimum deposit is 5 USDC");
  const { client, bridge, token, balance, name } = await readBridge(network, signer.address, rpcUrl);
  if (balance < value) throw new Error(`Not enough USDC in your ${client.chain.name} wallet`);
  const [nonce, version, separator] = await Promise.all([
    client.readContract({ address: token, abi: permitAbi, functionName: "nonces", args: [signer.address] }),
    client.readContract({ address: token, abi: permitAbi, functionName: "version" }).catch(() => "1"),
    client.readContract({ address: token, abi: permitAbi, functionName: "DOMAIN_SEPARATOR" }),
  ]);
  const domain = { name, version, chainId: client.chain.id, verifyingContract: token };
  const domainTypes = { EIP712Domain: [
    { name: "name", type: "string" }, { name: "version", type: "string" },
    { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
  ] } as const;
  if (hashDomain({ domain: { ...domain, chainId: BigInt(domain.chainId) }, types: domainTypes }) !== separator) throw new Error("USDC permit domain does not match this network");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const signature = splitSignature(await signer.signTypedData({ domain, types: permitTypes, primaryType: "Permit",
    message: { owner: signer.address, spender: bridge, value, nonce, deadline } }));
  const result = await info<{ txHash: Hex }>(network, { type: "depositWithPermit", user: signer.address,
    usd: String(value), deadline: String(deadline), signature, waitForReceipt: false });
  if (!/^0x[0-9a-f]{64}$/i.test(result.txHash)) throw new Error("Deposit relay did not return a transaction hash. Check activity before retrying.");
  onBroadcast?.(result.txHash);
  const receipt = await client.waitForTransactionReceipt({ hash: result.txHash, timeout: 60_000 });
  if (receipt.status !== "success") throw new DepositFailedError("Deposit transaction reverted");
  // Bridge2 can mine a successful transaction with FailedPermitDeposit. A hash alone is not proof of deposit.
  const transferred = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== token.toLowerCase()) return false;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      return event.eventName === "Transfer" && event.args.from.toLowerCase() === signer.address.toLowerCase()
        && event.args.to.toLowerCase() === bridge.toLowerCase() && event.args.value === value;
    } catch { return false; }
  });
  if (!transferred) throw new DepositFailedError("USDC was not transferred by the permit. Deposit failed; check your wallet and activity.");
  return result;
}
