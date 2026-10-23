# txgram

Trade TxFlow perpetual futures from a Telegram Mini App. Every order carries a builder code, so we earn a fee on the flow.
It runs as a single static SPA with no backend. Design: [docs/architecture.md](docs/architecture.md).

```
apps/miniapp        Vite + React mini app (Privy login, trade screen)
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
| `VITE_BUILDER_MAX_FEE_RATE` | Cap the user approves (`0.05%`). Must be ≥ `VITE_BUILDER_FEE` |

## Test

```sh
pnpm test                                   # signing test vectors (docs.txflow.com/api/signing)
pnpm --filter @txgram/scripts e2e           # real orders on testnet
```

The E2E uses throwaway keys and checks faucet → `approveBuilderFee` (with `signatureChainId`, as an external wallet would) → `approveAgent` → limit order / cancel → market fill / close → builder fee accrual.

## Hook it up to Telegram

1. **BotFather**: create a bot with `/newbot` → `/mybots` → Bot Settings → **Configure Mini App**, register the mini app URL → set the **Menu Button** to the same URL.
2. **Privy dashboard**: create an app → under Login methods enable **Telegram**, enter the bot token / handle, turn on seamless login → also enable **Wallet** login → add the mini app domain to Allowed domains.
3. Any static HTTPS host works for the mini app. Telegram login does not support `.xyz` domains.
   - **Cloudflare Workers** (configured in `wrangler.jsonc`): connect the repo, build command `pnpm run build`, deploy command `npx wrangler deploy`. Put the `VITE_*` values under **build variables** — Vite bakes them in at build time.
   - Cloudflare Pages / any static host: build `pnpm --filter @txgram/miniapp build`, serve `apps/miniapp/dist`.

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
