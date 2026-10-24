import { pageCard, type BotPage } from "./content";
import { clock, marketCard } from "./markets";

export interface BotEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  MINIAPP_URL: string;
  TXFLOW_NETWORK: "testnet" | "mainnet";
}
const pages = new Set<BotPage>(["home", "guide", "funds", "portfolio", "help", "markets"]);
// A short per-isolate retry cache for guide replies. Durable exactly-once delivery is not claimed.
const replies = new Map<string, { until: number; reply: Promise<Response> }>();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
async function authorized(actual: string, expected: string) {
  const bytes = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", bytes.encode(actual)),
    crypto.subtle.digest("SHA-256", bytes.encode(expected)),
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let different = 0;
  for (let i = 0; i < left.length; i++) different |= left[i]! ^ right[i]!;
  return different === 0;
}
async function answer(env: BotEnv, id: string, text?: string) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, ...(text ? { text } : {}) }), signal: AbortSignal.timeout(4_000),
    });
  } catch { /* The page can still be returned if callback acknowledgment is unavailable. */ }
}
async function handleUpdate(update: Record<string, unknown>, env: BotEnv): Promise<Response> {
  const callback = record(update.callback_query);
  const message = record(callback?.message ?? update.message);
  const chat = record(message?.chat);
  const from = record(callback?.from ?? message?.from);
  // This version serves only the private chat of the user who initiated the interaction.
  if (!message || chat?.type !== "private" || !positiveId(chat.id) || from?.id !== chat.id || from?.is_bot === true) return json({ ok: true });
  let page: BotPage = "home";
  if (callback) {
    if (typeof callback.id !== "string") return json({ ok: true });
    const candidate = typeof callback.data === "string" && callback.data.startsWith("page:") ? callback.data.slice(5) : undefined;
    if (!candidate || !pages.has(candidate as BotPage)) {
      await answer(env, callback.id);
      return json({ ok: true });
    }
    page = candidate as BotPage;
  } else {
    if (typeof message.text !== "string") return json({ ok: true });
    const command = message.text.trim().split(/\s/, 1)[0]!.split("@", 1)[0]!.toLowerCase();
    const commands: Record<string, BotPage> = { "/start": "home", "/help": "help", "/guide": "guide", "/funds": "funds", "/portfolio": "portfolio", "/markets": "markets" };
    page = commands[command] ?? "help";
  }
  const { updatedAt, photo, caption, parse_mode, reply_markup } = page === "markets"
    ? await marketCard(env.TXFLOW_NETWORK, env.MINIAPP_URL)
    : { ...pageCard(page, env.MINIAPP_URL, env.TXFLOW_NETWORK === "testnet"), updatedAt: undefined };
  if (callback) {
    // Refreshing within the cache window leaves the card unchanged, so the toast states which snapshot is shown.
    await answer(env, callback.id as string, page !== "markets" ? undefined : updatedAt ? `Prices as of ${clock(updatedAt)}` : "Markets are temporarily unavailable");
    // editMessageMedia swaps artwork and caption in place, and also converts an older text message into a card.
    if (positiveId(message.message_id)) return json({ method: "editMessageMedia", chat_id: chat.id, message_id: message.message_id, media: { type: "photo", media: photo, caption, parse_mode }, reply_markup });
  }
  return json({ method: "sendPhoto", chat_id: chat.id, photo, caption, parse_mode, reply_markup });
}
export default {
  async fetch(request: Request, env: BotEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api/telegram/health") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      const proof = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (proof !== null && (!env.TELEGRAM_WEBHOOK_SECRET || !await authorized(proof, env.TELEGRAM_WEBHOOK_SECRET))) return json({ error: "Unauthorized" }, 401);
      const digest = proof && env.TELEGRAM_BOT_TOKEN ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TELEGRAM_BOT_TOKEN)) : undefined;
      return json({ service: "txgram-bot", configured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET), network: env.TXFLOW_NETWORK,
        ...(digest ? { tokenFingerprint: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") } : {}) });
    }
    if (path !== "/api/telegram/webhook") {
      if (path.startsWith("/api/")) return json({ error: "Not found" }, 404);
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !["testnet", "mainnet"].includes(env.TXFLOW_NETWORK)) return json({ error: "Bot not configured" }, 503);
    if (!await authorized(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", env.TELEGRAM_WEBHOOK_SECRET)) return json({ error: "Unauthorized" }, 401);
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json({ error: "Expected JSON" }, 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 262_144) return json({ error: "Update too large" }, 413);
    let update: Record<string, unknown> | null;
    try { update = record(JSON.parse(raw)); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!update || typeof update.update_id !== "number" || !Number.isSafeInteger(update.update_id) || update.update_id < 0) return json({ error: "Invalid update" }, 400);
    const key = `${env.TELEGRAM_BOT_TOKEN}:${update.update_id}`;
    const previous = replies.get(key);
    if (previous && previous.until > Date.now()) { await previous.reply; return json({ ok: true }); }
    for (const [id, entry] of replies) if (entry.until <= Date.now()) replies.delete(id);
    if (replies.size >= 500) replies.delete(replies.keys().next().value!);
    const reply = handleUpdate(update, env).catch(() => {
      replies.delete(key);
      return json({ error: "Bot temporarily unavailable" }, 503);
    });
    replies.set(key, { until: Date.now() + 300_000, reply });
    return (await reply).clone();
  },
};
