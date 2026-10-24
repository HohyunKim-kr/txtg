export type BotPage = "home" | "guide" | "funds" | "portfolio" | "help" | "markets";
export interface BotButton { text: string; style?: "primary" | "success" | "danger"; callback_data?: string; web_app?: { url: string } }
/** Every page is a photo card with an HTML caption, so navigation can swap the artwork and text in place. */
export interface BotCard { photo: string; caption: string; reply_markup: { inline_keyboard: BotButton[][] }; parse_mode: "HTML" }

export const BOT_PROFILE = {
  name: "txgram",
  short_description: "Perpetual markets in Telegram. Explore markets, get funding help, and open txgram to trade.",
  description: "The official txgram guide bot. See perpetual markets, get help with deposits and withdrawals, and open the app to review and sign trades yourself. This bot never asks for your private key or recovery phrase.",
};
export const BOT_COMMANDS = [
  { command: "start", description: "Open the txgram menu" },
  { command: "markets", description: "View popular perpetual markets" },
  { command: "portfolio", description: "Open your portfolio in txgram" },
  { command: "funds", description: "Deposit and withdrawal guide" },
  { command: "guide", description: "Get started with txgram" },
  { command: "help", description: "Help and available features" },
];
// Bump after re-rendering apps/bot/banners so Telegram fetches the new images instead of its cached copy.
const ARTWORK_VERSION = 2;
function publicUrl(base: string) {
  const url = new URL(base);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("MINIAPP_URL must be a public HTTPS URL");
  return url;
}
export function appLink(base: string, view: "home" | "trade" | "portfolio" = "home", asset?: number) {
  const url = publicUrl(base);
  url.searchParams.set("view", view);
  if (view === "trade" && asset !== undefined) url.searchParams.set("asset", String(asset));
  else url.searchParams.delete("asset");
  return url.toString();
}
export const artwork = (base: string, page: BotPage) => new URL(`/bot/${page}.png?v=${ARTWORK_VERSION}`, publicUrl(base)).toString();
export const callback = (text: string, page: BotPage): BotButton => ({ text, callback_data: `page:${page}` });
export const openApp = (base: string, text = "Open txgram", view: "home" | "portfolio" = "home"): BotButton => ({ text, style: "primary", web_app: { url: appLink(base, view) } });
export const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const networkNote = (testnet: boolean) => testnet ? "\n\n<blockquote>Testnet · Practice funds have no monetary value.</blockquote>" : "";
export const BACK = callback("‹ Back to menu", "home");

export function pageCard(page: BotPage, url: string, testnet: boolean): BotCard {
  const caption: Record<BotPage, string> = {
    home: "<b>Welcome to txgram</b>\nAn app for trading TxFlow perpetuals inside Telegram.\n\n"
      + "· See popular markets\n· Get deposit and withdrawal help\n· Check positions and orders in the app\n\n"
      + "Tap <b>Open txgram</b> to get started.\n🔒 This bot never asks for your private key or recovery phrase.",
    guide: "<b>Get started</b>\n\n"
      + "<b>1.</b> Open txgram and connect your wallet.\n"
      + "<b>2.</b> " + (testnet ? "Request free test USDC in the app." : "Deposit USDC from a supported network.") + "\n"
      + "<b>3.</b> Complete account setup and enable trading.\n"
      + "<b>4.</b> Pick a market and review your order before you submit it.",
    funds: "<b>Deposit &amp; Withdraw</b>\n\n"
      + "<b>Deposit</b>\n" + (testnet
        ? "Use <b>Get test USDC</b> in the app for practice funds. Testnet QR deposits are currently unavailable; the From wallet flow uses mock USDC on Arbitrum Sepolia."
        : "Pick a supported USDC network in the app to see its minimum and fee, then scan the QR or copy the address.")
      + "\n\n<b>Withdraw</b>\nWithdrawals go to " + (testnet ? "Arbitrum Sepolia" : "Arbitrum") + ". Check the destination and amounts before you sign in your wallet."
      + "\n\n<i>An accepted request is not a completed transfer. Check Activity in the app for the latest status.</i>",
    portfolio: "<b>Your portfolio</b>\n\nOpen txgram to see your balance, positions, open orders and account activity.\n\n<i>Portfolio details in this chat are not available yet.</i>",
    help: "<b>Help</b>\n\n"
      + "/markets — Popular perpetual markets\n/portfolio — Open your account\n/funds — Deposit and withdrawal guide\n/guide — Getting started\n\n"
      + "<blockquote>🔒 This bot shows guides and public market data. It never places trades, signs withdrawals or asks for your private key or recovery phrase.</blockquote>",
    markets: "<b>Markets temporarily unavailable</b>\n\nPlease try again shortly, or open txgram to view live markets.",
  };
  const keyboard: BotButton[][] = page === "home" ? [
    [openApp(url)],
    [callback("Markets", "markets"), callback("Portfolio", "portfolio")],
    [callback("Deposit & Withdraw", "funds")],
    [callback("Get started", "guide"), callback("Help", "help")],
  ] : [
    [page === "portfolio" ? openApp(url, "Open portfolio", "portfolio") : openApp(url)],
    ...(page === "markets" ? [[callback("Refresh", "markets"), BACK]] : [[BACK]]),
  ];
  return { photo: artwork(url, page), caption: caption[page] + networkNote(testnet), parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } };
}
