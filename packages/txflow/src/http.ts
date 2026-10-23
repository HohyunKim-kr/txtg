import type { Network } from "./config";

export class TxFlowError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "TxFlowError";
  }
}

async function post(network: Network, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(network.httpUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-version": network.apiVersionHeader },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new TxFlowError(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 429) throw new TxFlowError("rate limit exceeded", 429, json);
  return json;
}

interface InfoResponse<T> {
  success: boolean;
  code: number;
  data: T;
  message?: string;
}

/** `POST /info`. Returns `data`, throws on `success: false`. */
export async function info<T>(network: Network, body: Record<string, unknown>): Promise<T> {
  const res = (await post(network, "/info", body)) as InfoResponse<T> | undefined;
  if (!res?.success) throw new TxFlowError(res?.message ?? "info request failed", res?.code, res);
  return res.data;
}

export interface ExchangeOk {
  status: "ok";
  code?: number;
  data?: { type: string; data: { statuses: (string | { error: string })[] } };
  traceId?: string;
}

/**
 * `POST /exchange`. Throws on `status: "err"` and on a failed execution status.
 * `"success"` means accepted by consensus — not filled.
 */
export async function exchange(
  network: Network,
  envelope: object,
  opts: { confirm?: boolean } = {},
): Promise<ExchangeOk> {
  const body = opts.confirm ? { ...envelope, confirm: "executed" } : envelope;
  const res = (await post(network, "/exchange", body)) as
    | ExchangeOk
    | { status: "err" | "pending"; code?: number; message?: string; response?: string }
    | undefined;
  if (!res) throw new TxFlowError("empty exchange response");
  if (res.status !== "ok") {
    const r = res as { message?: string; response?: string; code?: number };
    throw new TxFlowError(r.message ?? r.response ?? `exchange ${res.status}`, r.code, res);
  }
  const status = res.data?.data.statuses[0];
  if (status && typeof status === "object" && "error" in status) {
    throw new TxFlowError(status.error, undefined, res);
  }
  return res;
}

/** Testnet faucet: credits test USDC to the perp account. */
export async function requestFund(network: Network, address: string): Promise<unknown> {
  if (network.name !== "testnet") throw new TxFlowError("faucet is testnet only");
  return post(network, "/request-fund", { address });
}
