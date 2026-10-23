import { describe, expect, it, vi } from "vitest";
import { closePosition } from "../src/trading";
import { PendingExchangeError } from "../src/http";
import type { TxFlow, Trader } from "../src/client";
import type { PerpMarket, Position } from "../src/info";

const user = "0x1111111111111111111111111111111111111111";
const market = { index: 1, baseCurrency: "BTC", priceTick: "0.1", szDecimals: 4, maxMarketOrderSize: 100 } as PerpMarket;
const position = (szi: string): Position => ({ asset: "1", szi, markPx: null, leverage: { type: "Cross", value: 10 } }) as Position;
const state = (p?: Position) => ({ assetPositions: p ? [{ position: p }] : [] });
function setup(current: string, remaining?: string) {
  const query = vi.fn().mockResolvedValueOnce(state(position(current))).mockResolvedValue(state(remaining ? position(remaining) : undefined));
  const tx = { info: { clearinghouseState: query, l2Book: vi.fn().mockResolvedValue({ levels: [[{ px: "100.0" }], [{ px: "100.2" }]] }) } } as unknown as TxFlow;
  const order = vi.fn().mockResolvedValue({ status: "ok" });
  return { tx, order, trader: { order } as unknown as Trader };
}
describe("position closing", () => {
  it("closes without a cached mark/mid and uses latest size instead of the stale UI size", async () => {
    const { tx, trader, order } = setup("0.0002");
    expect(await closePosition(tx, user, trader, market, position("0.0005"))).toEqual({ status: "closed", remaining: "0" });
    expect(order).toHaveBeenCalledWith([{ asset: 1, isBuy: false, price: "99.0", size: "0.0002", reduceOnly: true, tif: "FrontendMarket", marginMode: "cross" }]);
  });
  it("buys to close a short, supports partial reduction, and verifies the resulting position", async () => {
    const { tx, trader, order } = setup("-0.0004", "-0.0002");
    expect((await closePosition(tx, user, trader, market, position("-0.0004"), 0.5)).status).toBe("reduced");
    expect(order.mock.calls[0]![0][0]).toMatchObject({ isBuy: true, size: "0.0002", reduceOnly: true });
  });
  it("never sends an order when the position is already flat or the book has no exit liquidity", async () => {
    const { tx, trader, order } = setup("0");
    await closePosition(tx, user, trader, market, position("0.1"));
    expect(order).not.toHaveBeenCalled();
    const missing = setup("0.1");
    vi.mocked(missing.tx.info.l2Book).mockResolvedValue({ levels: [[], []] } as never);
    await expect(closePosition(missing.tx, user, missing.trader, market, position("0.1"))).rejects.toThrow("liquidity");
    expect(missing.order).not.toHaveBeenCalled();
  });
  it("reconciles a pending accepted order without submitting it twice", async () => {
    const { tx, trader, order } = setup("0.0002");
    order.mockRejectedValue(new PendingExchangeError());
    expect((await closePosition(tx, user, trader, market, position("0.0002"))).status).toBe("closed");
    expect(order).toHaveBeenCalledTimes(1);
  });
});
