import type { Address, LocalAccount } from "viem";
import {
  approveAgentAction,
  approveBuilderFeeAction,
  cancelAction,
  nextNonce,
  orderAction,
  updateLeverageAction,
  updateMarginModeAction,
  type Builder,
  type MarginMode,
  type OrderInput,
} from "./actions";
import type { Network } from "./config";
import { exchange } from "./http";
import { createInfoClient } from "./info";
import { signAgent, signDirect, type AccountSigner } from "./signing";

export interface DirectOpts {
  /** EIP-712 domain chain for wallets that force their connected chain. */
  signatureChainId?: number;
}

export function createTxFlow(network: Network) {
  const send = (env: object) => exchange(network, env, { confirm: true });

  return {
    network,
    info: createInfoClient(network),

    async approveBuilderFee(signer: AccountSigner, builder: Address, maxFeeRate: string, opts: DirectOpts = {}) {
      const action = approveBuilderFeeAction(network, builder, maxFeeRate);
      return send(await signDirect(network, signer, action, opts.signatureChainId));
    },

    async approveAgent(signer: AccountSigner, agentAddress: Address, agentName: string, opts: DirectOpts = {}) {
      const action = approveAgentAction(network, agentAddress, agentName);
      return send(await signDirect(network, signer, action, opts.signatureChainId));
    },

    /** Trading actions, signed by an approved agent key. */
    trader(agent: Pick<LocalAccount, "signTypedData">, builder?: Builder) {
      const sign = <A extends { type: string }>(action: A) => signAgent(network, agent, action, nextNonce());
      return {
        order: async (orders: OrderInput[]) => send(await sign(orderAction(orders, builder))),
        cancel: async (cancels: { asset: number; oid: number }[]) => send(await sign(cancelAction(cancels))),
        updateLeverage: async (asset: number, leverage: number, marginMode: MarginMode) =>
          send(await sign(updateLeverageAction(asset, leverage, marginMode))),
        updateMarginMode: async (asset: number, isCross: boolean) =>
          send(await sign(updateMarginModeAction(asset, isCross))),
        /** Claims all unclaimed builder rewards; the agent must belong to the builder account. */
        claimBuilderRewards: async () => send(await sign({ type: "claimBuilderRewards" as const })),
      };
    },
  };
}

export type TxFlow = ReturnType<typeof createTxFlow>;
export type Trader = ReturnType<TxFlow["trader"]>;
