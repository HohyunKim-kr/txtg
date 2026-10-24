# txgram Telegram bot: English copy and capability assessment

Status: the basic English bot backend is now implemented locally in `apps/bot`: welcome, guides, help, public markets, refresh/back buttons and mini-app launch links. Account linking and notifications remain proposed; nothing has been deployed or registered on Telegram. See [connection instructions](telegram-bot-setup.md). The broader feature assessment below separates future capabilities from this basic implementation.

## English profile and welcome

Display name: **txgram**

Short description:

> Perpetual markets in Telegram. Explore markets, get funding help, and open txgram to trade.

Description shown before starting the bot:

> Your Telegram companion for txgram. Explore perpetual markets, get help with deposits and withdrawals, and open your trading terminal. Portfolio details and transaction signatures are available in the mini app.

The profile advertises only the features actually enabled on the bot. Add account linking to it once that feature ships. The shipped copy lives in `apps/bot/src/content.ts`; the copy below is the original proposal.

Welcome (`/start`):

> **Welcome to txgram.**
>
> Your perpetuals terminal, right inside Telegram.
>
> Explore markets, learn how to fund your account, or open txgram to get started.
>
> **Testnet mode:** balances are practice funds with no monetary value.

The testnet sentence follows the configured network; it must not appear on a mainnet bot or be replaced by a claim that real-funds settlement has been verified.

Proposed main menu:

```text
[ Open txgram                       ]
[ Markets          ] [ My Portfolio ]
[ Deposit & Withdraw                ]
[ Getting Started  ] [ Help         ]
```

The menu can expand as account linking and notifications ship. Unsupported buttons should lead to an honest explanation rather than a simulated balance or transaction.

## English guidance and account states

Getting Started:

> **Get started with txgram**
>
> 1. Open txgram and connect your wallet.
> 2. On testnet, request free test USDC. On mainnet, choose a supported deposit network in the app.
> 3. Complete account setup and enable trading.
> 4. Choose a market and review your order before submitting it.

Buttons: **Open txgram** / **Deposit guide** / **Back**.

Deposit & Withdraw:

> **Move funds with txgram**
>
> Open the app to see supported USDC deposit networks, minimums and fees. Scan the generated QR code or copy the address for your selected network.
>
> Withdrawals currently use Arbitrum. Review the destination, total deduction and estimated received amount before signing in your wallet.
>
> A pending request is not a completed transfer. Check Activity for the latest recorded status.

On testnet, add: **Testnet deposit addresses are currently unavailable. Use Get test USDC in the app, or the separate From wallet flow on Arbitrum Sepolia.**

Unlinked portfolio:

> **Link your wallet to view your portfolio**
>
> Open txgram to verify your wallet and connect it to this private chat. After linking, you can check your balance, positions and account activity here.

Until account linking ships, use **Portfolio in chat is not available yet. Open txgram to view your account.** The current mini app cannot perform this proposed linking step.

Buttons: **Open portfolio** / **Back**. The portfolio destination requires the routing work described below.

Account status vocabulary:

| State | English text |
| --- | --- |
| No linked wallet | Wallet not linked |
| Snapshot available | Last updated: {UTC timestamp} |
| Provider error | Account data is temporarily unavailable. Please try again. |
| Deposit observed in progress | Deposit pending |
| Deposit credited in ledger | Deposit credited |
| Withdrawal accepted/reserved | Withdrawal pending |
| Destination settlement verified | Withdrawal completed |
| Alerts disabled | Notifications are off |

Never turn API acceptance or a reserved withdrawal balance into a completed withdrawal message. A deposit status must be associated with the tracked transfer; an unrelated recent account deposit is not proof that a displayed QR address was funded.

## What can be built

Rows describe the full development scope. The basic implementation now covers English guides, public market snapshots and contextual app launch links; account-specific features remain future work.

| Bot feature | User experience | Existing txgram support | Additional work |
| --- | --- | --- | --- |
| Branded welcome and FAQ | English welcome, guide pages, Back buttons | Existing txgram logo and product copy | Bot update handler and profile/command configuration |
| Market dashboard | Price, daily change, volume; Refresh / Trade buttons | `perpMeta`, `marketStats`, `activeAssetCtx` | Server-side API reads, cache, message formatting and callbacks |
| Market chart preview | Candle image in chat; Open chart for interaction | `candles`, interactive chart in mini app | Generate a static chart image on the server; keep drag/pinch in the mini app |
| Portfolio snapshot | Equity, available collateral, PnL, positions | `clearinghouseState` | Verified Telegram-to-wallet binding, private-chat checks and refresh callbacks |
| Orders and history | Open orders, TP/SL, recent executions | `openOrders` merges TP/SL; `userFills` | Account binding and pagination |
| Deposit QR in chat | Select supported network; QR, Copy address, fee and minimum | `depositRoutes`, `depositAddress` | Account binding, server-side PNG QR generation and environment labels; funded relay credit is still unverified |
| Transfer status | Pending / credited / completed with refreshed history | `ledger`; native deposit receipt verification | Track the particular transfer and reconcile its lifecycle; destination settlement verification remains a release check |
| Price and account notifications | Price threshold, new fill, transfer update | Market and account read APIs | Persistent subscriptions, scheduled checks, deduplication and explicit user notification preferences |
| Referral entry links | Invite link with referral context | Telegram supports start parameters | Attribution storage and a product referral policy; builder fee routing does not itself implement an end-user referral program |
| Contextual app launch | Open portfolio, a market or funds directly | App already has these views internally | Parse validated/allowlisted launch parameters and select the corresponding screen |
| Trading through chat | Order preview and a confirmation button | Trading currently uses a client-held agent key | New server-side delegation architecture, authorization/revocation and reconciliation; not part of the first bot version |

Telegram supports callback buttons, address-copy buttons and message updates. An existing bot message can act as a refreshable dashboard. Structured rich messages are also available in the current Bot API; begin with regular formatted messages and inline keyboards, then validate rich-message presentation on target clients. A fully interactive HTML/canvas chart stays inside the mini app. See [bot features](https://core.telegram.org/bots/features), [inline keyboards](https://core.telegram.org/bots/api#inlinekeyboardbutton), [copy buttons](https://core.telegram.org/bots/api#copytextbutton) and [rich messages](https://core.telegram.org/bots/api#sendrichmessage).

## Recommended first version

1. English profile, `/start`, `/help`, guide pages, Open txgram button and public market snapshots.
2. Verified account linking, private portfolio/order/history snapshots and account activity.
3. Opt-in price/fill/transfer notifications with persisted delivery state.

Deposit, withdrawal and position-management buttons should open the relevant mini-app screen for review and signing. Merely opening a link must never submit a financial action. Chat-based trade execution would be a separate feature, not a switch enabled by adding a bot token.

## Repository fit and missing pieces

- `wrangler.jsonc` runs `apps/bot/src/worker.ts` first for `/api/*` and serves the SPA and bot card artwork as static assets. Account-link endpoints would be added under the same routing. Cloudflare documents [Worker scripts with static assets](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/).
- The bot token and webhook secret belong in Worker secrets, never `VITE_*` variables or the client bundle. A webhook handler should verify Telegram's secret header, process only expected update types, acknowledge callbacks and deduplicate repeated update IDs. See [setWebhook](https://core.telegram.org/bots/api#setwebhook).
- `WalletSession` currently exposes a browser wallet signer, not a server account link. `telegramUser()` reads `initDataUnsafe` for client display; that value must not authorize bot account access. Link a wallet using validated, fresh Telegram init data plus wallet ownership proof bound to the Telegram user, domain and a single-use nonce. See [Telegram validation](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
- Store account links, notification preferences, consumed linking challenges and processed events in persistent storage, for example D1. Keep signing keys in the existing wallet/device; read-only chat snapshots do not need those keys.
- Use one explicit network for bot reads and app links. Do not display mainnet deposit addresses next to a testnet account balance.
- The app reads `view`/`asset` query parameters and `market_<id>`/`portfolio` start parameters (`apps/miniapp/src/lib/launch.ts`) to pick its first screen. Funds screens are not yet launchable this way. Telegram documents [direct Mini App links](https://core.telegram.org/bots/webapps#direct-link-mini-apps).
- Notifications require the user to have started the bot or granted applicable write access. Provide disable/unlink controls, stop delivery after blocking, and show snapshot times. Scheduled polling is not a promise of instant alerts. See [Telegram FAQ](https://core.telegram.org/bots/faq) and [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

A bot Worker and setup CLI are prepared, but no bot username or live webhook registration has been verified. There is no verified account-link service. Live bot customization and end-to-end Telegram testing remain deployment work after the implementation is selected.
