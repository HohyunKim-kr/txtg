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

export function useAccountState(user?: Address) {
  const qc = useQueryClient();
  useEffect(
    () => {
      if (!user) return;
      return socket.subscribe({ type: "clearinghouseState", user }, (d) => {
        const s = d as AccountState & { user: string };
        if (s.user?.toLowerCase() === user.toLowerCase()) qc.setQueryData(keys.account(user), s);
      });
    },
    [qc, user],
  );
  return useQuery<AccountState>({ queryKey: ["clearinghouse", user], queryFn: () => tx.info.clearinghouseState(user!), enabled: !!user, refetchInterval: 15_000 });
}

export function useOpenOrders(user?: Address) {
  const qc = useQueryClient();
  useEffect(
    () => user ?
      // The stream tells us something changed; the snapshot is the source of truth.
      socket.subscribe({ type: "orderUpdates", user }, () => {
        void qc.invalidateQueries({ queryKey: keys.orders(user) });
        void qc.invalidateQueries({ queryKey: keys.account(user) });
        void qc.invalidateQueries({ queryKey: ["fills", user] });
      }) : undefined,
    [qc, user],
  );
  return useQuery<OpenOrder[]>({ queryKey: ["openOrders", user], queryFn: () => tx.info.openOrders(user!), enabled: !!user, refetchInterval: 15_000 });
}

export function useFills(user?: Address) {
  return useQuery({ queryKey: ["fills", user], queryFn: () => tx.info.userFills(user!), enabled: !!user, refetchInterval: 15_000 });
}

export function useLedger(user?: Address) {
  return useQuery({ queryKey: ["ledger", user], queryFn: () => tx.info.ledger(user!), enabled: !!user, refetchInterval: 10_000 });
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
