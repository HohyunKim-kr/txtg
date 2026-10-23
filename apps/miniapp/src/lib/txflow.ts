import { TxFlowSocket, createTxFlow } from "@txgram/txflow";
import { QueryClient } from "@tanstack/react-query";
import { config } from "../config";

export const tx = createTxFlow(config.network);
export const socket = new TxFlowSocket(config.network);

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: false, staleTime: 5_000 } },
});
