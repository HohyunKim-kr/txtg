# Architecture

A single Telegram Mini App that does **trading only** on TxFlow. Every order carries a builder code so we earn a fee on the flow.

- No backend. A static SPA hosted on Cloudflare Pages.
- The bot is just a shell created in BotFather (Main Mini App + menu button). No bot server.

## 1. Scope

**In the MVP (perps)**

- Login (Privy Telegram seamless login / external wallet)
- Enable trading (deposit check → `approveBuilderFee` → `approveAgent`)
- Market / limit orders, cancel
- Leverage, cross / isolated margin
- Positions, open orders, balance
- Order book, current price

**Later**

- Outcome (prediction market) trading
- Deposit / withdraw UI (the MVP deposits via the official app or the faucet)
- TP/SL, TWAP
- Bot command trading, alerts, analytics, explorer

## 2. TxFlow basics

- Account = EVM address. No API keys. Reads are unauthenticated; writes are signed locally.
- **Account key** (user's wallet): `approveBuilderFee`, `approveAgent` — direct EIP-712.
- **Agent key**: `order`, `cancel`, `updateLeverage`, `updateMarginMode` — MessagePack + `Agent` signing. Cannot withdraw or transfer.
- Setup order is fixed: **deposit → `approveBuilderFee` → `approveAgent`**.
- The API sends CORS `*`, so the browser calls it directly (verified on testnet, 2026-10-23).
- Testnet `https://rpc.txflow-testnet.xyz`, mainnet `https://rpc.txflow.com`.

## 3. Structure

```
 Telegram client
 ┌──────────────────────────────────────────────┐
 │  Mini App (Cloudflare Pages)                 │
 │                                              │      ┌──────────────┐
 │  ┌──────────────────────────────────────┐    │◄────►│ Privy        │
 │  │ Privy SDK (embedded + external)      │    │      └──────────────┘
 │  └──────────────┬───────────────────────┘    │
 │           WalletSession / AccountSigner      │      ┌──────────────┐
 │  ┌──────────────▼─────────────────────────┐  │      │ TxFlow       │
 │  │ packages/txflow                        │  ├─────►│ /info        │
 │  │  info · exchange · signing · ws        │  │      │ /exchange    │
 │  └──────────────▲─────────────────────────┘  │      │ /ws          │
 │                 │                            │      └──────────────┘
 │     agent key ─ SecureStorage                │
 └──────────────────────────────────────────────┘
```

## 4. Login

| Path | For | How |
|---|---|---|
| **A. Privy embedded wallet** (default) | New users | Telegram seamless login → wallet created automatically, no signing prompts |
| **B. External wallet** | Users already on TxFlow with their own wallet | Privy wallet login (WalletConnect under the hood) → MetaMask / Rabby etc. |
| Dev wallet | Local development, E2E | Used when `VITE_PRIVY_APP_ID` is empty; testnet only; key kept in localStorage |

A and B both go through Privy (no separate Reown dependency). Screens only see one `WalletSession`.

```ts
interface WalletSession {
  address: Address;
  kind: "embedded" | "external" | "dev";
  signer: AccountSigner;          // signTypedData(td) → Hex
  signatureChainId?: number;      // the wallet's current chain
  silent: boolean;                // signs without a prompt (embedded, dev)
}
```

- Privy wallets always **sign under the wallet's current chain and send `signatureChainId`**. This avoids external wallets refusing to sign for a chain they don't know (TxFlow 2511 / 869). E2E confirmed that an `approveBuilderFee` signed under `421614` is accepted on testnet.

## 5. Agent key

- One label per account: `txgram-tma`. **Never use the empty label** (it would overwrite another app's unnamed agent).
- Storage: the first that works of Telegram `SecureStorage` → `DeviceStorage` → `localStorage` (outside Telegram).
- The key is stored **before** the approval request, so a lost response never orphans an approved key.
- Lost key or new device: create a new key and approve it under the same label → the old key is retired automatically.
- On start, `approvedAgents` must show my label bound to the local key's address; otherwise re-approve.

## 6. Screen flow

```
Open the mini app
 → Login (Privy seamless / external wallet)
 → geoCheck                              stop if the region is restricted
 → approveAgentEligibility               activated by a first deposit?
 → Deposit prompt (testnet: POST /request-fund)
 → maxBuilderFee → if not approved, [sign] approveBuilderFee
 → Create agent key → SecureStorage
 → [sign] approveAgent
 → Trade screen
```

- Embedded and dev wallets sign steps 2 and 3 back to back from a single "Start trading" tap, with no prompts.
- `maxBuilderFee` is indexed and returns `NONE` for a few seconds after approval → on a successful approval we record it locally and trust that.
- `/account-status` (`accountStatus`, `accessCodeStatus`) returned 404 on testnet (2026-10-23) → not used; `approveAgentEligibility` instead.

**APIs used by the trade screen**

| Element | Read | Live | Write |
|---|---|---|---|
| Market list | `perpMeta` | `allMids` (name → mid) | — |
| Order book | `l2Book` | `l2Book` | — |
| Ticker bar (mark, oracle, funding, 24h) | `activeAssetCtx` | `activeAssetCtx` | — |
| Leverage / margin | `activeAssetData` | — | `updateLeverage`, `updateMarginMode` |
| Positions / balance | `clearinghouseState` | `clearinghouseState` | `order` (reduce-only market close) |
| Open orders | `frontendOpenOrders` | `orderUpdates` → refetch | `cancel` |

- Market orders use `tif: "FrontendMarket"` priced at mid ±1%.
- Response quirks: `returnOnEquity` is already in percent; `activeAssetData.maxTradeSzs` / `markPx` return bogus values on testnet, so they are not used.

## 7. Repository layout (pnpm workspaces)

```
apps/
  miniapp/        Vite + React + TS, Tailwind v4, Privy, TanStack Query
                  Telegram via telegram-web-app.js + a thin wrapper (src/lib/telegram.ts), no SDK
packages/
  txflow/         TxFlow client
    signing.ts    Direct EIP-712 / Agent (MessagePack) signing — verified against the docs' test vectors
    actions.ts    Action builders (key order = signed byte order), nonce
    http.ts       /info, /exchange (confirm: executed), faucet
    info.ts       Read types and client
    ws.ts         /ws — 10 s ping, re-subscribe on reconnect
    format.ts     priceTick / szDecimals rounding
    client.ts     createTxFlow(): approval actions + trader(agent)
  scripts/        e2e-testnet.ts, builder.ts (status / claim)
```

Design tokens are taken from app.txflow.com's CSS: background `#080d00`, accent `#8df885`, buy `#5fd655`, sell `#ff5d5c`, font Space Grotesk.

### Signing rules (the parts that fail silently)

- Prices and sizes are strings, hashed exactly as written (`"50000.0"` ≠ `"50000"`). Match `priceTick` and `szDecimals`.
- `a` / `asset` on `/exchange` is an **integer**; `coin` on `/info` is a **numeric string**.
- Keep the documented action key order; never sort. Omit null optional fields.
- Send `x-api-version: 2026-08-16` on every request.
- `success` from `/exchange` only means accepted by consensus → read fills from `orderUpdates`.
- A builder fee `f` over the cap, or without approval, is dropped without an error → check `builderState`.
- **Addresses inside an action are hashed as MessagePack binary (20 bytes).** This includes `order.builder.b` — as a string the signature no longer matches and the order is rejected with `Agent … is not authorized` (the docs only show this for `vaultTransfer`).

## 8. Open questions

| Item | Ask |
|---|---|
| How mainnet access codes are issued and bound (not in the API docs) | TxFlow |
| Mainnet builder slot (txflow.com/apply), mainnet `/exchange` whitelist | TxFlow |
| Testnet `claimBuilderRewards` returns "This interface is currently disabled." | TxFlow |
| Fallback storage policy for clients without `SecureStorage` | Internal |
| Mini app domain (Telegram login doesn't support `.xyz`) | Internal |
