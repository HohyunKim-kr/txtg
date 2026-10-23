/**
 * Operator CLI for the builder account.
 *
 *   BUILDER_PRIVATE_KEY=0x… pnpm builder status
 *   BUILDER_PRIVATE_KEY=0x… pnpm builder claim
 *
 * Set NETWORK=mainnet for mainnet (default testnet). The key never leaves this machine.
 */
import { NETWORKS, createTxFlow, type NetworkName } from "@txgram/txflow";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const net = NETWORKS[(process.env.NETWORK as NetworkName) ?? "testnet"];
const tx = createTxFlow(net);
const pk = process.env.BUILDER_PRIVATE_KEY as Hex | undefined;
if (!pk) throw new Error("BUILDER_PRIVATE_KEY is required");
const builder = privateKeyToAccount(pk);
const cmd = process.argv[2] ?? "status";

const state = await tx.info.builderState(builder.address);
console.log(`network   ${net.txflowNetwork}`);
console.log(`builder   ${builder.address}`);
console.log(`users     ${state.activeUserCount}`);
console.log(`eligible  ${state.eligible} (perp account ${state.perpsAccountValue} USDC, needs ≥ 100)`);
console.log(`accrued   ${state.accruedRewards}`);
console.log(`claimable ${state.claimableRewards}`);
console.log(`claimed   ${state.claimedRewards}`);

if (cmd === "claim") {
  if (Number(state.claimableRewards) <= 0) {
    console.log("nothing to claim");
  } else {
    // The claim is agent-signed: register a one-off agent under a fixed label, then claim.
    const agent = privateKeyToAccount(generatePrivateKey());
    await tx.approveAgent(builder, agent.address, "txgram-builder-cli");
    await tx.trader(agent).claimBuilderRewards();
    const after = await tx.info.builderState(builder.address);
    console.log(`claimed → ${after.claimedRewards} (claimable ${after.claimableRewards})`);
  }
}
