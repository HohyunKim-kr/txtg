# Connect the English txgram bot

The basic bot is implemented locally: English `/start`, guide/help/funding pages, public market snapshots, refresh/back buttons, and links into the mini app. Chat portfolio access and notifications are not enabled. No bot has been configured or deployed by this change.

Use Node.js 22 or newer for Wrangler. The development machine may have Node 20 selected; use `nvm use 22` or your installed Node 22+ runtime before running the Worker commands. Keep `TXFLOW_NETWORK` in `wrangler.jsonc` consistent with the mini app's build-time `VITE_NETWORK`.

## 1. Supply server secrets

Use the existing Telegram bot's token from BotFather. This is not a Privy App ID. Keep it out of chat, screenshots, git and `VITE_*` variables.

Copy `.dev.vars.example` to `.dev.vars` without overwriting an existing secrets file, then set:

```dotenv
TELEGRAM_BOT_TOKEN=<your existing bot token>
TELEGRAM_WEBHOOK_SECRET=<a random 32–256 character value using letters, digits, underscores or hyphens>
```

Use owner-only file permissions for `.dev.vars` (`chmod 600 .dev.vars`). It is gitignored. The setup CLI reads this file automatically; existing process environment variables take precedence.

Upload those same two values to the `txgram` Worker as encrypted runtime secrets. With Wrangler already authenticated:

```sh
pnpm exec wrangler secret bulk .dev.vars
```

Alternatively, set both as Secrets in the Worker's dashboard. These are runtime secrets; the existing `VITE_PRIVY_APP_ID` remains a separate mini-app build variable. [Cloudflare secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/).

## 2. Deploy the code

Review `MINIAPP_URL` and `TXFLOW_NETWORK` in `wrangler.jsonc`. The default URL is `https://txgram.txgram.workers.dev` and the network is `testnet`.

```sh
pnpm install
pnpm test
pnpm build
pnpm worker:check
pnpm exec wrangler deploy
```

The Worker serves the existing mini-app assets and handles `/api/telegram/webhook`. `GET /api/telegram/health` reports whether both bot secrets are set; it never returns their contents. It does not prove that Telegram has registered or delivered the webhook.

## 3. Register the bot

Preview the English profile, command list, Open txgram menu button and webhook registration:

```sh
pnpm bot:setup
```

Apply the previewed plan after the Worker is deployed with matching secrets:

```sh
pnpm bot:setup --apply
```

If using a different domain, set `MINIAPP_URL` and `BOT_PUBLIC_URL` for this command and update the Worker configuration. For a mainnet bot, set `TXFLOW_NETWORK=mainnet` in the command environment as well as in the Worker and mini-app build.

The setup CLI checks `getMe`, the current webhook and authenticated Worker health before changing settings. It compares a token fingerprint to confirm that the Worker and setup command use the same bot token, and verifies that their webhook secrets match. It refuses to replace a different existing webhook by default: that endpoint may belong to an existing bot service or login integration. Only use `--replace-webhook` after establishing that the old integration may be replaced. It preserves pending Telegram updates. It configures the default English profile and commands without deleting any previously configured language-specific overrides; review those in BotFather if the old bot had localized profile copy.

The CLI sends configuration requests only. It does not send chat messages or perform trades.

## Card design

Each reply is a photo card: page artwork, an HTML caption and inline buttons. The style is light and calm, like a Korean fintech app: white cards, Pretendard type, a single blue `primary` button (Open txgram) and neutral buttons for everything else, with few emojis. Menu buttons edit the same card in place (`editMessageMedia`). Market rows and buttons show direction with ▲/▼ rather than colored buttons. The artwork is `apps/miniapp/public/bot/<page>.png`, served from the same Worker. Rendered artwork shows no prices or balances. Live figures only appear in the caption.

To change the artwork, edit `apps/bot/banners/banner.html`, run `pnpm --filter @txgram/bot banners` (needs Google Chrome and network access for the Pretendard font; set `CHROME` for another Chromium path), and bump `ARTWORK_VERSION` in `apps/bot/src/content.ts` so Telegram stops using its cached images. The blue button needs a Telegram client that supports button styles; older clients show a default button.

## 4. Check in Telegram

Open the bot's private chat and send `/start`. Check:

- The welcome card shows its artwork, the Testnet label and the Open txgram button.
- Markets shows actual API data with a snapshot timestamp, or an honest unavailable state.
- Menu buttons swap the card in place. Refresh shows a "Prices as of" notice and Back returns to the menu.
- Open BTC/ETH launches the intended market after login/setup as required.
- My Portfolio opens the mini app, without displaying invented balances in chat.
- Deposit & Withdraw displays the guide, including the current testnet limitations.

No account linking, trading delegation, deposit execution or outgoing notification subscriptions are introduced by this version. Mini-app charting, wallet authorization and financial actions remain in the app.

## Delivery limits

The webhook responds using Telegram's documented response-method mechanism; Telegram does not return a delivery result for that response. Callback acknowledgment is an ordinary Bot API request. A bounded in-memory update cache suppresses immediate repeats within one Worker isolate; durable exactly-once processing is not claimed. This version has no financial side effects and stores no wallet keys or account links.

Tests mock Telegram calls and market responses. A local Worker check can verify routing and missing-secret behavior without a bot token, but actual Telegram delivery still needs the deployment and private-chat check above. [Telegram webhook documentation](https://core.telegram.org/bots/api#setwebhook).
