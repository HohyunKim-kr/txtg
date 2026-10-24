import { BOT_COMMANDS, BOT_PROFILE, appLink } from "../../../apps/bot/src/content";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const localSecrets = fileURLToPath(new URL("../../../.dev.vars", import.meta.url));
if (existsSync(localSecrets)) process.loadEnvFile(localSecrets);

const apply = process.argv.includes("--apply");
const miniapp = process.env.MINIAPP_URL || "https://txgram.txgram.workers.dev";
const origin = new URL(process.env.BOT_PUBLIC_URL || miniapp).origin;
const webhook = `${origin}/api/telegram/webhook`;
appLink(miniapp);
if (!origin.startsWith("https://")) throw new Error("BOT_PUBLIC_URL must use HTTPS");
const plan = [
  { method: "setMyName", body: { name: BOT_PROFILE.name, language_code: "" } },
  { method: "setMyShortDescription", body: { short_description: BOT_PROFILE.short_description, language_code: "" } },
  { method: "setMyDescription", body: { description: BOT_PROFILE.description, language_code: "" } },
  { method: "setMyCommands", body: { commands: BOT_COMMANDS, language_code: "" } },
  { method: "setChatMenuButton", body: { menu_button: { type: "web_app", text: "Open txgram", web_app: { url: appLink(miniapp) } } } },
  { method: "setWebhook", body: { url: webhook, allowed_updates: ["message", "callback_query"], drop_pending_updates: false } },
];
if (!apply) {
  process.stdout.write(JSON.stringify({ mode: "preview", note: "No Telegram settings changed. Use --apply with server secrets to register this plan.", plan }, null, 2) + "\n");
} else {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error("Set TELEGRAM_BOT_TOKEN and a 32–256 character TELEGRAM_WEBHOOK_SECRET. Use the same values in the Worker.");
  const call = async <T>(method: string, body: object = {}): Promise<T> => {
    let response: Response;
    try { response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); }
    catch { throw new Error(`Telegram ${method} request failed; no credentials logged`); }
    const data = await response.json() as { ok: boolean; result: T; error_code?: number };
    if (!response.ok || !data.ok) throw new Error(`Telegram ${method} failed (${data.error_code ?? response.status})`);
    return data.result;
  };
  const me = await call<{ username: string }>("getMe");
  const current = await call<{ url: string }>("getWebhookInfo");
  if (current.url && current.url !== webhook && !process.argv.includes("--replace-webhook")) throw new Error("This bot already uses a different webhook. No settings changed. Confirm that integration can be replaced before using --replace-webhook.");
  const health = await fetch(`${origin}/api/telegram/health`, { headers: { "X-Telegram-Bot-Api-Secret-Token": secret }, signal: AbortSignal.timeout(10_000) }).catch(() => { throw new Error("Deploy the bot Worker before registering its webhook"); });
  // A deployment without the bot Worker answers this path with the SPA's HTML.
  const state = await health.json().catch(() => ({})) as { service?: string; configured?: boolean; network?: string; tokenFingerprint?: string };
  if (!health.ok || state.service !== "txgram-bot" || !state.configured) throw new Error("Bot Worker is not configured. Deploy it with both server secrets first.");
  if (state.tokenFingerprint !== createHash("sha256").update(token).digest("hex")) throw new Error("Worker bot token differs from the setup token. No Telegram settings changed.");
  if (state.network !== (process.env.TXFLOW_NETWORK || "testnet")) throw new Error("Worker network differs from TXFLOW_NETWORK; check the bot and mini app network before applying settings.");
  for (const step of plan) await call(step.method, step.method === "setWebhook" ? { ...step.body, secret_token: secret } : step.body);
  const registered = await call<{ url: string }>("getWebhookInfo");
  if (registered.url !== webhook) throw new Error("Telegram did not retain the expected webhook");
  process.stdout.write(`Configured @${me.username}: English profile, menu and webhook (${state.network}). No chat messages sent.\n`);
}
