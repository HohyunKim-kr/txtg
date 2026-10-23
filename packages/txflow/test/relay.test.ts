import { afterEach, describe, expect, it, vi } from "vitest";
import { TXFLOW_USDC } from "../src/actions";
import { NETWORKS } from "../src/config";
import { collateralRoutes, depositAddress, depositRoutes, type RelayNetwork } from "../src/relay";

const user = "0x1111111111111111111111111111111111111111";
const peg = "0x2222222222222222222222222222222222222222";
const network: RelayNetwork = { chain: "arbitrum", chain_name: "Arbitrum One", chain_id: "42161", chain_type: "evm", deposit_enabled: true, deposit_eta_minutes: 17, support_memo: false,
  tokens: [{ symbol: "USDCARB", display_symbol: "USDC", name: "USD Coin", token_address: "0x3333333333333333333333333333333333333333", dst_token: `USDC:${TXFLOW_USDC}`, decimals: 6, deposit_fee: "0", min_amount: "3", max_amount: "500000", deposit_enabled: true }] };
afterEach(() => vi.unstubAllGlobals());
describe("USDC deposit address routes", () => {
  it("excludes disabled routes, unsupported chains, spot wrappers and invalid limits", () => {
    const rows = [network, { ...network, chain: "disabled", deposit_enabled: false }, { ...network, chain_type: "bitcoin" },
      ...[{ deposit_enabled: false }, { dst_token: `txUSDC:${TXFLOW_USDC}` }, { min_amount: "" }, { min_amount: "NaN" }, { max_amount: "1" }, { deposit_fee: "-1" }]
        .map((patch) => ({ ...network, tokens: [{ ...network.tokens[0]!, ...patch }] }))];
    expect(collateralRoutes(rows)).toEqual([{ network, token: network.tokens[0] }]);
  });
  it("uses the selected environment and route wire symbol, with the user's TxFlow destination", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ code: 0, data: { networks: [network] } }))
      .mockResolvedValueOnce(Response.json({ code: 0, data: { deposit_address: peg } }));
    vi.stubGlobal("fetch", fetcher);
    const [route] = await depositRoutes(NETWORKS.mainnet);
    expect(await depositAddress(NETWORKS.mainnet, route!, user)).toEqual({ deposit_address: peg });
    expect(fetcher.mock.calls[0]![0]).toBe("https://api-bridge.txflow.com/api/v1/bridge/networks");
    expect(JSON.parse(fetcher.mock.calls[1]![1].body)).toEqual({ channel_id: 0, src_chain: "arbitrum", dst_chain: "txflow", dst_address: user, symbol: "USDCARB" });
  });
  it("never falls back to mainnet if the testnet gateway blocks access", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>Blocked</html>", { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(depositRoutes(NETWORKS.testnet)).rejects.toThrow("unavailable (403)");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toContain("https://devnet-bridge.txflow.net/");
  });
  it("rejects invalid peg addresses and missing required memos before displaying a QR", async () => {
    const route = collateralRoutes([network])[0]!;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 0, data: { deposit_address: "0x0000000000000000000000000000000000000000" } })));
    await expect(depositAddress(NETWORKS.mainnet, route, user)).rejects.toThrow("invalid address");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 0, data: { deposit_address: peg } })));
    await expect(depositAddress(NETWORKS.mainnet, { ...route, network: { ...network, support_memo: true } }, user)).rejects.toThrow("missing memo");
    const sol = { ...network, chain: "solana", chain_type: "solana" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ code: 0, data: { deposit_address: peg } })));
    await expect(depositAddress(NETWORKS.mainnet, collateralRoutes([sol])[0]!, user)).rejects.toThrow("invalid address");
  });
});
