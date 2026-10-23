import { encodeAbiParameters, encodeEventTopics, erc20Abi, hashDomain, hashTypedData, recoverTypedDataAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORKS } from "../src/config";
import { TXFLOW_USDC, usdcUnits, withdrawAction, withdrawalQuote } from "../src/actions";
import { directTypedData, signDirect } from "../src/signing";
import { depositUsdc, DepositFailedError } from "../src/funds";

const rpc = vi.hoisted(() => ({ readContract: vi.fn(), waitForTransactionReceipt: vi.fn() }));
vi.mock("viem", async (original) => ({ ...await original<typeof import("viem")>(), createPublicClient: () => ({ ...rpc, chain: { id: 421614, name: "Arbitrum Sepolia" } }) }));
const account = privateKeyToAccount(`0x${"ab".repeat(32)}`);
const bridge = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const hash = `0x${"33".repeat(32)}`;
const depositDomain = { name: "MockUSDC", version: "1", chainId: 421614, verifyingContract: token };
const domainTypes = { EIP712Domain: [
  { name: "name", type: "string" }, { name: "version", type: "string" },
  { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" },
] } as const;
const withdrawTypes = { Withdraw3: [
  { name: "txflowNetwork", type: "string" }, { name: "destination", type: "address" },
  { name: "signatureChainId", type: "string" }, { name: "tokenAddress", type: "address" },
  { name: "amount", type: "string" }, { name: "nonce", type: "uint64" },
] } as const;

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("USDC withdrawal signing", () => {
  it("signs the documented Withdraw3 fields, excluding wire chainId/apiVersion", async () => {
    const action = withdrawAction(NETWORKS.testnet, bridge, "12.345678", 421614, 1700000000000);
    const td = directTypedData(NETWORKS.testnet, action, 421614);
    const message = { txflowNetwork: "TxFlow-Testnet", destination: bridge, signatureChainId: "66eee", tokenAddress: TXFLOW_USDC, amount: "12.345678", nonce: 1700000000000 };
    expect(td.message).toEqual(message);
    expect(hashTypedData(td)).toBe(hashTypedData({ domain: td.domain, types: withdrawTypes, primaryType: "Withdraw3", message: { ...message, nonce: BigInt(message.nonce) } }));
    const env = await signDirect(NETWORKS.testnet, account, action, 421614);
    expect(env.nonce).toBe(action.nonce);
    expect(env.signatureChainId).toBe(421614);
    const sig = await account.signTypedData(td);
    expect(await recoverTypedDataAddress({ ...td, signature: sig })).toBe(account.address);
    expect(hashTypedData(directTypedData(NETWORKS.mainnet, { ...action, txflowNetwork: "TxFlow-Mainnet", chainId: 869 }, 42161))).not.toBe(hashTypedData(td));
  });
  it("rejects unsafe destinations and imprecise or below-minimum amounts before signing", () => {
    for (const amount of ["-2", "0", "1.99", "NaN", "3.0000001", "1e3", "2..0"]) expect(() => withdrawAction(NETWORKS.testnet, bridge, amount, 421614)).toThrow();
    expect(() => withdrawAction(NETWORKS.testnet, `0x${"0".repeat(40)}`, "2", 421614)).toThrow();
    expect(usdcUnits("5.123456")).toBe(5123456n);
  });
  it("quotes the observed inclusive withdrawal fee without deducting it twice", () => {
    expect(withdrawalQuote("2", "2")).toEqual({ debit: "2", fee: "1", receive: "1" });
    expect(withdrawalQuote("10.123456", "100").receive).toBe("9.123456");
    expect(() => withdrawalQuote("10", "9.99")).toThrow("withdrawable");
  });
});

describe("relayed deposit confirmation", () => {
  beforeEach(() => {
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => ({ usdcToken: token, balanceOf: 20_000_000n, name: "MockUSDC", nonces: 7n, version: "1", DOMAIN_SEPARATOR: hashDomain({ domain: { ...depositDomain, chainId: BigInt(depositDomain.chainId) }, types: domainTypes }) })[functionName]);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return { status: 200, text: async () => JSON.stringify({ success: true, code: 0, data: body.type === "settings" ? { bridge2_contract_address: bridge } : { txHash: hash } }) };
    }));
    rpc.waitForTransactionReceipt.mockResolvedValue({ status: "success", logs: [{ address: token,
      topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from: account.address, to: bridge } }),
      data: encodeAbiParameters([{ type: "uint256" }], [5_000_000n]),
    }] });
  });
  it("uses the bridge's token and exact-value Arbitrum permit; confirms a real Transfer", async () => {
    const signer = { address: account.address, signTypedData: vi.fn(account.signTypedData) };
    const onBroadcast = vi.fn();
    expect(await depositUsdc(NETWORKS.testnet, signer, "5", undefined, onBroadcast)).toEqual({ txHash: hash });
    const typed = signer.signTypedData.mock.calls[0]![0];
    expect(typed.domain).toEqual(depositDomain);
    expect(typed.message).toMatchObject({ owner: account.address, spender: bridge, value: 5_000_000n, nonce: 7n });
    expect(onBroadcast).toHaveBeenCalledWith(hash);
  });
  it("rejects a mined success receipt with a failed permit / no token transfer", async () => {
    rpc.waitForTransactionReceipt.mockResolvedValue({ status: "success", logs: [] });
    await expect(depositUsdc(NETWORKS.testnet, account, "5")).rejects.toBeInstanceOf(DepositFailedError);
  });
  it("refuses to sign a permit with a different token domain or insufficient balance", async () => {
    const signer = { address: account.address, signTypedData: vi.fn(account.signTypedData) };
    await expect(depositUsdc(NETWORKS.testnet, signer, "21")).rejects.toThrow("Not enough USDC");
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => ({ usdcToken: token, balanceOf: 20_000_000n, name: "MockUSDC", nonces: 7n, version: "1", DOMAIN_SEPARATOR: `0x${"00".repeat(32)}` })[functionName]);
    await expect(depositUsdc(NETWORKS.testnet, signer, "5")).rejects.toThrow("permit domain");
    expect(signer.signTypedData).not.toHaveBeenCalled();
  });
});
