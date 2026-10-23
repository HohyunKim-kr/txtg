import { requestFund } from "@txgram/txflow";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, Hex, LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { config } from "../config";
import { readKey, writeKey } from "../lib/telegram";
import { tx } from "../lib/txflow";
import type { WalletSession } from "../wallet/context";

const net = config.network;
const agentKey = (user: Address) => `txgram_agent_${net.name}_${user.toLowerCase()}`;
const builderFlag = (user: Address) =>
  `txgram:builder:${net.name}:${user.toLowerCase()}:${config.builder?.address.toLowerCase()}:${config.builder?.maxFeeRate}`;

async function loadAgent(user: Address): Promise<LocalAccount | null> {
  const pk = await readKey(agentKey(user));
  return pk ? privateKeyToAccount(pk as Hex) : null;
}

export interface OnboardingState {
  geoBlocked: boolean;
  funded: boolean;
  builderOk: boolean;
  agent: LocalAccount | null;
  agentOk: boolean;
}

async function check(user: Address): Promise<OnboardingState> {
  const [geo, elig, agent, agents] = await Promise.all([
    tx.info.geoCheck().catch(() => ({ geoBlock: false })),
    tx.info.approveAgentEligibility(user),
    loadAgent(user),
    tx.info.approvedAgents(user).catch(() => []),
  ]);

  let builderOk = !config.builder || localStorage.getItem(builderFlag(user)) === "1";
  if (!builderOk && config.builder) {
    const fee = await tx.info.maxBuilderFee(user, config.builder.address).catch(() => undefined);
    builderOk = fee?.status === "ACTIVE" && fee.maxFeeRate >= config.builder.fee;
  }

  const agentOk = Boolean(
    agent &&
      agents.some(
        (a) => a.agentName === config.agentName && a.agentAddress.toLowerCase() === agent.address.toLowerCase(),
      ),
  );

  return { geoBlocked: geo.geoBlock, funded: elig.eligible, builderOk, agent, agentOk };
}

export function useOnboarding(session: WalletSession | undefined) {
  const qc = useQueryClient();
  const user = session?.address;
  const key = ["onboarding", user];

  const state = useQuery({ queryKey: key, queryFn: () => check(user!), enabled: !!user, staleTime: Infinity });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const opts = { signatureChainId: session?.signatureChainId };

  const faucet = useMutation({
    mutationFn: async () => {
      await requestFund(net, user!);
      // Credit lands within a block or two.
      for (let i = 0; i < 15; i++) {
        if ((await tx.info.approveAgentEligibility(user!)).eligible) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
    },
    onSettled: refresh,
  });

  const approveBuilder = useMutation({
    mutationFn: async () => {
      const b = config.builder!;
      await tx.approveBuilderFee(session!.signer, b.address, b.maxFeeRate, opts);
      // maxBuilderFee is indexed and lags the block; remember the approval locally.
      localStorage.setItem(builderFlag(user!), "1");
    },
    onSettled: refresh,
  });

  const enableTrading = useMutation({
    mutationFn: async () => {
      let agent = await loadAgent(user!);
      if (!agent) {
        const pk = generatePrivateKey();
        // Store before approving so a lost response never orphans an approved key.
        await writeKey(agentKey(user!), pk);
        agent = privateKeyToAccount(pk);
      }
      await tx.approveAgent(session!.signer, agent.address, config.agentName, opts);
    },
    onSettled: refresh,
  });

  return { state, faucet, approveBuilder, enableTrading, refresh };
}
