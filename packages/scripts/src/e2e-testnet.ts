/**
 * End-to-end check against TxFlow testnet with throwaway keys:
 * faucet → approveBuilderFee → approveAgent → resting order → cancel →
 * market order with builder fee → close.
 */
import {
  NETWORKS,
  createTxFlow,
  closePosition,
  marketPrice,
  requestFund,
  roundPrice,
  roundSize,
  nextNonce,
  type AccountSigner,
} from "@txgram/txflow";
import type { Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const net = NETWORKS.testnet;
const tx = createTxFlow(net);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log("•", ...a);

async function waitFor<T>(label: string, fn: () => Promise<T | undefined>, ms = 20_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn().catch(() => undefined);
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error(`timeout: ${label}`);
    await sleep(1000);
  }
}

async function fund(addr: Address) {
  log("faucet", addr, JSON.stringify(await requestFund(net, addr)));
  return waitFor("funded", async () => {
    const s = await tx.info.clearinghouseState(addr);
    return Number(s.marginSummary.accountValue) > 0 ? s.marginSummary.accountValue : undefined;
  });
}

const main = privateKeyToAccount(generatePrivateKey());
const builder = privateKeyToAccount(generatePrivateKey());
const agent = privateKeyToAccount(generatePrivateKey());
const signer: AccountSigner = main;

log("account", main.address);
log("builder", builder.address);
log("agent  ", agent.address);

log("funded", await fund(main.address), "USDC");
log("builder funded", await fund(builder.address), "USDC");

// Signed under Arbitrum Sepolia's chain id, as an external wallet would.
log(
  "approveBuilderFee (signatureChainId 421614)",
  JSON.stringify(await tx.approveBuilderFee(signer, builder.address, "0.1%", { signatureChainId: 421614 })),
);
log("maxBuilderFee", JSON.stringify(await tx.info.maxBuilderFee(main.address, builder.address)));

log("approveAgent", JSON.stringify(await tx.approveAgent(signer, agent.address, "txgram-tma")));
log("approvedAgents", JSON.stringify(await tx.info.approvedAgents(main.address)));

const markets = await tx.info.perpMeta();
const btc = markets.find((m) => m.name === "BTC-USDC")!;
const book = await tx.info.l2Book(btc.index);
const bid = Number(book.levels[0][0]!.px);
const ask = Number(book.levels[1][0]!.px);
const mid = (bid + ask) / 2;
log("BTC mid", mid);

const trader = tx.trader(agent, { address: builder.address, fee: 10 });

log("updateLeverage", JSON.stringify(await trader.updateLeverage(btc.index, 10, "cross")));

// Resting post-only bid well below the market.
const restPx = roundPrice(mid * 0.95, btc.priceTick, "down");
const size = roundSize(20 / mid, btc.szDecimals);
log("resting order", restPx, size);
log(
  JSON.stringify(
    await trader.order([{ asset: btc.index, isBuy: true, price: restPx, size, tif: "Alo", marginMode: "cross" }]),
  ),
);
const open = await waitFor("open order", async () => {
  const o = await tx.info.frontendOpenOrders(main.address);
  return o.find((x) => x.asset === btc.index) ?? undefined;
});
log("open order", open.oid, open.limitPx, open.sz);
log("cancel", JSON.stringify(await trader.cancel([{ asset: btc.index, oid: open.oid }])));
await waitFor("cancelled", async () => {
  const o = await tx.info.frontendOpenOrders(main.address);
  return o.some((x) => x.oid === open.oid) ? undefined : true;
});
log("cancelled");

// Market buy, then reduce-only market sell.
log(
  "market buy",
  JSON.stringify(
    await trader.order([
      { asset: btc.index, isBuy: true, price: marketPrice(mid, true, btc.priceTick), size, tif: "FrontendMarket", marginMode: "cross" },
    ]),
  ),
);
const pos = await waitFor("position", async () => {
  const s = await tx.info.clearinghouseState(main.address);
  return s.assetPositions.find((p) => Number(p.position.asset) === btc.index)?.position;
});
log("position", pos.szi, "@", pos.entryPx, "lev", JSON.stringify(pos.leverage));

const partial = await closePosition(tx, main.address, trader, btc, pos, 0.5);
if (partial.status !== "reduced") throw new Error("partial close did not reduce the position");
log("partial close verified", JSON.stringify(partial));
const closed = await closePosition(tx, main.address, trader, btc, pos);
if (closed.status !== "closed") throw new Error("full close did not flatten the position");
log("close verified", JSON.stringify(closed));

// Repeat in the other direction. Close price comes from the current opposing book.
const shortBook = await tx.info.l2Book(btc.index);
await trader.order([{ asset: btc.index, isBuy: false, price: marketPrice(Number(shortBook.levels[0][0]!.px), false, btc.priceTick), size, tif: "FrontendMarket", marginMode: "cross" }]);
const short = await waitFor("short", async () => (await tx.info.clearinghouseState(main.address)).assetPositions.find((p) => Number(p.position.asset) === btc.index && Number(p.position.szi) < 0)?.position);
log("short opened", short.szi);
const protectedOrders = (["tp", "sl"] as const).map((kind) => {
  const px = roundPrice(mid * (kind === "tp" ? 0.95 : 1.05), btc.priceTick);
  return { asset: btc.index, isBuy: true, price: marketPrice(Number(px), true, btc.priceTick), size, reduceOnly: true, tif: "FrontendMarket" as const, marginMode: "cross" as const, trigger: { isMarket: true, triggerPx: px, tpsl: kind } };
});
log("TP/SL", JSON.stringify(await trader.order(protectedOrders, "positionTpsl")));
const protection = await waitFor("TP/SL open orders", async () => {
  const rows = (await tx.info.openOrders(main.address)).filter((o) => o.asset === btc.index && o.reduceOnly);
  return rows.length >= 2 ? rows : undefined;
});
log("TP/SL cancel", JSON.stringify(await trader.cancel(protection.map((o) => ({ asset: Number(o.asset), oid: o.oid })))));
const shortClose = await closePosition(tx, main.address, trader, btc, short);
if (shortClose.status !== "closed") throw new Error("short close failed");
log("short close verified", JSON.stringify(shortClose));

await waitFor("flat", async () => {
  const s = await tx.info.clearinghouseState(main.address);
  return s.assetPositions.some((p) => Number(p.position.asset) === btc.index) ? undefined : true;
});
log("flat");

// A separate isolated position verifies margin-mode routing and its close key.
log("isolated mode", JSON.stringify(await trader.updateMarginMode(btc.index, false)));
log("isolated leverage", JSON.stringify(await trader.updateLeverage(btc.index, 5, "isolated")));
const isolatedBook = await tx.info.l2Book(btc.index);
await trader.order([{ asset: btc.index, isBuy: true, price: marketPrice(Number(isolatedBook.levels[1][0]!.px), true, btc.priceTick), size, tif: "FrontendMarket", marginMode: "isolated" }]);
const isolated = await waitFor("isolated position", async () => (await tx.info.clearinghouseState(main.address)).assetPositions.find((p) => p.position.leverage.type.toLowerCase() === "isolated")?.position);
if (isolated.leverage.value !== 5) throw new Error("isolated leverage was not applied");
const isolatedClose = await closePosition(tx, main.address, trader, btc, isolated);
if (isolatedClose.status !== "closed") throw new Error("isolated close failed");
log("isolated close verified", JSON.stringify(isolatedClose));

await sleep(3000);
const bs = await tx.info.builderState(builder.address);
log("builderState", JSON.stringify(bs));
if (!(Number(bs.claimableRewards) > 0)) throw new Error("builder fee did not accrue");

// Builder claims through its own agent.
const builderAgent = privateKeyToAccount(generatePrivateKey());
log("builder approveAgent", JSON.stringify(await tx.approveAgent(builder, builderAgent.address, "txgram-builder-cli")));
try {
  log("claim", JSON.stringify(await tx.trader(builderAgent).claimBuilderRewards()));
} catch (e) {
  // The testnet gateway currently answers "This interface is currently disabled." for claims.
  log("claim skipped:", (e as Error).message);
}
log("builderState", JSON.stringify(await tx.info.builderState(builder.address)));
const beforeWithdraw = await tx.info.clearinghouseState(main.address);
try {
  const nonce = nextNonce();
  log("withdraw3", JSON.stringify(await tx.withdrawUsdc(main, main.address, "2", { signatureChainId: 421614, nonce })));
  await waitFor("withdrawal reserved/debited", async () => {
    const after = await tx.info.clearinghouseState(main.address);
    return Number(beforeWithdraw.withdrawable) - Number(after.withdrawable) >= 1.99 ? after : undefined;
  });
  const row = await waitFor("withdrawal ledger", async () => (await tx.info.ledger(main.address)).data.find((r) => r.delta.type === "withdraw" && Number(r.delta.nonce) === nonce));
  if (Number(row.delta.amount) + Number(row.delta.fee) !== 2) throw new Error("withdrawal ledger fee/amount mismatch");
  log("withdrawal ledger", JSON.stringify(row.delta));
  log("withdrawal accepted and collateral reserved/debited; destination-chain settlement is separate");
} catch (e) {
  // Record a gateway restriction separately; never report this as a successful withdrawal.
  if ((e as Error).message.includes("interface is currently disabled")) log("withdrawal blocked by testnet gateway:", (e as Error).message);
  else throw e;
}
log("OK");
