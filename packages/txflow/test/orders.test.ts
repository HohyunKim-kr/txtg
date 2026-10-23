import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeOpenOrders, type OpenOrder, type TpslOrder } from "../src/info";
import { NETWORKS } from "../src/config";
import { exchange, PendingExchangeError } from "../src/http";

afterEach(() => vi.unstubAllGlobals());
describe("live order reconciliation", () => {
  it("includes separately indexed TP/SL child orders with cancellable numeric ids", () => {
    const pair = { asset: "1", coin: "BTC-USDC", side: "B", quantity: "0.0002", tpOid: "101", slOid: "102", tpTriggerPrice: "90000", slTriggerPrice: "70000", marginMode: "Cross", createTime: 1000 } as TpslOrder;
    const result = mergeOpenOrders([], [pair]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ asset: 1, oid: 101, isTrigger: true, reduceOnly: true, triggerPx: "90000", orderType: "Take profit" });
    expect(result[1]).toMatchObject({ oid: 102, orderType: "Stop loss" });
    expect(mergeOpenOrders([result[0]!], [pair])).toHaveLength(2);
    expect(mergeOpenOrders([], [{ ...pair, tpOid: "", slOid: "0" }])).toEqual([]);
  });
  it("does not hide an execution error after a successful first batch status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 200, text: async () => JSON.stringify({ status: "ok", data: { data: { statuses: ["success", { error: "Insufficient margin" }] } } }) })));
    await expect(exchange(NETWORKS.testnet, {})).rejects.toThrow("Insufficient margin");
  });
  it("marks a timeout as pending so callers reconcile rather than re-sign", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ status: 202, text: async () => JSON.stringify({ status: "pending", txHash: "0xabc" }) })));
    await expect(exchange(NETWORKS.testnet, {})).rejects.toBeInstanceOf(PendingExchangeError);
  });
});
