# txgram

A Telegram perpetuals terminal for TxFlow: live markets, trading, portfolio, USDC deposits and withdrawals. An optional builder address adds a user-approved fee to order flow.
It runs as a single static SPA with no backend. Design: [docs/architecture.md](docs/architecture.md).

```
apps/miniapp        Vite + React mini app (markets, Privy, trading, portfolio, funds)
packages/txflow     TxFlow client — signing, /info, /exchange, WebSocket
packages/scripts    Testnet E2E, builder operator CLI
```

## Run

```sh
pnpm install
cp apps/miniapp/.env.example apps/miniapp/.env.local   # fill in only what you need
pnpm dev                                               # http://localhost:5173
```

With `VITE_PRIVY_APP_ID` empty the app starts in **dev wallet** mode: the key lives in the browser's localStorage and only works on testnet. You can go from faucet to orders without Privy.

| Variable | Description |
|---|---|
| `VITE_NETWORK` | `testnet` (default) / `mainnet` |
| `VITE_PRIVY_APP_ID` | Privy app id. Required on mainnet |
| `VITE_BUILDER_ADDRESS` | Builder address. Empty → orders go out without a builder fee and the approval step is skipped |
| `VITE_BUILDER_FEE` | Fee per order in tenths of a basis point (`10` = 0.01%, perp cap `100`) |
| `VITE_BUILDER_MAX_FEE_RATE` | Cap the user approves (`0.05%`). Must cover the order fee |
| `VITE_ARBITRUM_RPC_URL` | Optional browser-accessible Arbitrum RPC override; choose the matching mainnet/Sepolia network |

## Test

```sh
pnpm test                                   # signing test vectors (docs.txflow.com/api/signing)
pnpm --filter @txgram/scripts e2e           # real orders on testnet
```

The E2E uses throwaway keys on testnet: faucet → builder approval → agent approval → post-only order/cancel → long/partial close/full close → short/TP-SL/cancel/close → builder accrual → account-signed withdrawal and ledger reservation. Arbitrum settlement is separate from API acceptance; the test does not claim destination-chain completion. Permit deposits have mocked receipt/domain tests and live read-only bridge/domain verification; no real funds are used.

## Hook it up to Telegram

1. **BotFather**: create a bot with `/newbot` → `/mybots` → Bot Settings → **Configure Mini App**, register the mini app URL → set the **Menu Button** to the same URL.
2. **Privy dashboard**: create an app → under Login methods enable **Telegram**, enter the bot token / handle, turn on seamless login → also enable **Wallet** login → add the mini app domain to Allowed domains.
3. Any static HTTPS host works for the mini app. Telegram login does not support `.xyz` domains.
   - **Cloudflare Workers** (configured in `wrangler.jsonc`): connect the repo, build command `pnpm run build`, deploy command `npx wrangler deploy`. Put the `VITE_*` values under **build variables** — Vite bakes them in at build time.
   - Cloudflare Pages / any static host: build `pnpm --filter @txgram/miniapp build`, serve `apps/miniapp/dist`.

## Funds and trading

- Home starts with account equity, available collateral and positions, followed by the top four markets by actual 24h volume and a searchable market list with Popular/Top gainers filters. Ticker logos are served locally (sources/licenses in `apps/miniapp/public/tokens`). Trade opens account setup when needed; Portfolio includes positions, open orders, executions, and transfer activity.
- Charts show up to 500 actual candles with drag/pinch/wheel navigation, keyboard pan/zoom, timeframe selection, reset and expansion. Panning is preserved during price refreshes.
- Orders support market/limit, post-only/GTC/IOC, reduce-only, configurable slippage, leverage, and cross/isolated margin. Position controls support partial/full market close and TP/SL.
- Closing fetches the latest position and opposing book, sends a reduce-only order, and verifies the remaining position. A timeout stays unconfirmed rather than reporting a fill.
- Position TP/SL comes from `tpslOrders`; the current testnet `frontendOpenOrders` omits these child orders. Both sources are merged by order id for display/cancellation.
- Crypto transfer deposits use TxRelay: select an enabled USDC collateral network, scan/copy the issued route address, and view live minimum/fee/ETA. Only routes mapped to TxFlow’s actual USDC collateral are offered; spot wrappers are excluded. Address issuance was checked on mainnet; end-to-end credit from a funded transfer remains unverified. The testnet relay currently blocks access (403/CORS), so testnet opens with the direct test faucet. Native wallet deposit and withdrawal support **USDC on Arbitrum** (Arbitrum Sepolia on testnet).
- The separate **From wallet** deposit tab uses an exact-value EIP-2612 permit; wallet-funding details are collapsed. Bridge2 and its token are read from chain/API; testnet uses a mock USDC, not Circle faucet USDC. The app checks the permit domain and verifies the ERC-20 transfer in the receipt. TxFlow ledger credit is tracked separately.
- Withdraw: enter a destination, review amounts and network, then sign with the user wallet. The agent cannot withdraw. Pending requests survive reloads and are reconciled against the withdrawal nonce in the ledger.
- **Observed fee discrepancy:** testnet `withdraw3.amount = "2"` reserves 2 USDC total and records ledger `amount = "1"`, `fee = "1"`. The UI therefore shows an inclusive 1 USDC fee. This differs from the current API prose describing an additional fee; verify mainnet accounting before enabling real-funds release.
- Testnet faucet credits are practice funds. They are not deposits of real USDC.

## Mainnet release configuration

The code remains on testnet by default. Before releasing for real funds:

1. Obtain TxFlow mainnet `/exchange` access and a builder slot at [txflow.com/apply](https://txflow.com/apply); establish how end users receive access.
2. Configure the production Privy app and allowed deployment/Telegram domains.
3. Set **build** variables in Cloudflare Settings → Build → Build variables and secrets. `VITE_PRIVY_APP_ID` must exist during the Vite build; adding it only to runtime Variables and Secrets does not update the SPA.
4. Set the optional builder address/fee/cap and fund the builder's own perp account to the protocol's 100 USDC eligibility minimum. No builder address is hardcoded.
5. Verify mainnet deposit credit, withdrawal fee semantics, destination-chain settlement, wallet recovery, and builder accrual before activating a mainnet build. Switching only `VITE_NETWORK` does not establish this verification.

## Builder operations

```sh
BUILDER_PRIVATE_KEY=0x… pnpm --filter @txgram/scripts builder status
BUILDER_PRIVATE_KEY=0x… pnpm --filter @txgram/scripts builder claim
```

- Fees only accrue while the builder address holds **at least 100 USDC** in its perp account.
- On mainnet, builder codes and `/exchange` are whitelisted → [txflow.com/apply](https://txflow.com/apply).
- As of 2026-10-23 the testnet gateway blocks `claimBuilderRewards` (`This interface is currently disabled.`).

## Working on the TxFlow client

API docs: https://docs.txflow.com/llms.txt — read it before writing or changing `packages/txflow`, and follow the integration rules in its appendix.

- When touching signing, run both `pnpm test` (the docs' test vectors) and `pnpm --filter @txgram/scripts e2e` (real orders on testnet).
- Examples and tests always target testnet (`https://rpc.txflow-testnet.xyz`).
