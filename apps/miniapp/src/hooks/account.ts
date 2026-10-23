import type { ClearinghouseState, OpenOrder, PerpMarket } from "@txgram/txflow";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Address } from "viem";
import { socket, tx } from "../lib/txflow";

export type AccountState = ClearinghouseState & { availableToTrade?: string };

const keys = {
  account: (user: Address) => ["clearinghouse", user],
  orders: (user: Address) => ["openOrders", user],
};

export function useAccountState(user: Address) {
  const qc = useQueryClient();
  useEffect(
    () =>
      socket.subscribe({ type: "clearinghouseState", user }, (d) => {
        const s = d as AccountState & { user: string };
        if (s.user?.toLowerCase() === user.toLowerCase()) qc.setQueryData(keys.account(user), s);
      }),
    [qc, user],
  );
  return useQuery<AccountState>({ queryKey: keys.account(user), queryFn: () => tx.info.clearinghouseState(user) });
}

export function useOpenOrders(user: Address) {
  const qc = useQueryClient();
  useEffect(
    () =>
      // The stream tells us something changed; the snapshot is the source of truth.
      socket.subscribe({ type: "orderUpdates", user }, () => qc.invalidateQueries({ queryKey: keys.orders(user) })),
    [qc, user],
  );
  return useQuery<OpenOrder[]>({ queryKey: keys.orders(user), queryFn: () => tx.info.frontendOpenOrders(user) });
}

export function useLeverage(user: Address, market: PerpMarket | undefined) {
  return useQuery({
    queryKey: ["leverage", user, market?.index],
    queryFn: async () => {
      const d = await tx.info.activeAssetData(user, market!.index);
      return {
        value: d.leverage.value,
        mode: (d.leverage.type.toLowerCase() === "isolated" ? "isolated" : "cross") as "cross" | "isolated",
      };
    },
    enabled: !!market,
  });
}
