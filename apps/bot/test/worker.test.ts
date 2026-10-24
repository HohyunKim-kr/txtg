import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type BotEnv } from "../src/worker";
import { BOT_COMMANDS, BOT_PROFILE, pageCard } from "../src/content";
import { parseLaunch } from "../../miniapp/src/lib/launch";

const env: BotEnv = { ASSETS: { fetch: vi.fn(async () => new Response("mini app")) }, TELEGRAM_BOT_TOKEN: "unit-test-token-not-a-live-credential", TELEGRAM_WEBHOOK_SECRET: "unit-test-webhook-secret-not-a-live-secret", MINIAPP_URL: "https://txgram.example", TXFLOW_NETWORK: "testnet" };
let sequence = 0;
const message = (text: string, chatType = "private") => ({ update_id: ++sequence, message: { message_id: 9, text, from: { id: 42, is_bot: false }, chat: { id: 42, type: chatType } } });
const request = (body: unknown, secret = env.TELEGRAM_WEBHOOK_SECRET!) => new Request("https://txgram.example/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret }, body: JSON.stringify(body) });
afterEach(() => vi.unstubAllGlobals());

describe("English bot webhook", () => {
  it("rejects a forged webhook and missing server configuration before contacting any service", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await worker.fetch(request(message("/start"), "wrong"), env)).status).toBe(401);
    expect((await worker.fetch(request(message("/start")), { ...env, TELEGRAM_BOT_TOKEN: undefined })).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns an English welcome card with artwork and real Mini App buttons without fetching or exposing keys", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const data = await (await worker.fetch(request(message("/start referral_context")), env)).json();
    expect(data).toMatchObject({ method: "sendPhoto", chat_id: 42, parse_mode: "HTML", photo: "https://txgram.example/bot/home.png?v=2" });
    expect(data.caption).toContain("Welcome to txgram");
    expect(data.caption).toContain("Practice funds");
    expect(data.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Open txgram", style: "primary", web_app: { url: "https://txgram.example/?view=home" } });
    expect(data.reply_markup.inline_keyboard.flat().map((b: { callback_data?: string }) => b.callback_data).filter(Boolean)).toEqual(["page:markets", "page:portfolio", "page:funds", "page:guide", "page:help"]);
    expect(JSON.stringify(data)).not.toContain(env.TELEGRAM_BOT_TOKEN);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not disclose account information or respond in group chats", async () => {
    expect(await (await worker.fetch(request(message("/portfolio", "group")), env)).json()).toEqual({ ok: true });
    const body = await (await worker.fetch(request(message("/portfolio")), env)).json();
    expect(body.caption).toContain("not available yet");
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toContain("view=portfolio");
  });
  it("acknowledges button callbacks and edits the same message; suppresses repeat updates in this isolate", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
    const update = { update_id: ++sequence, callback_query: { id: "callback-id", from: { id: 42 }, data: "page:funds", message: { message_id: 9, chat: { id: 42, type: "private" } } } };
    const body = await (await worker.fetch(request(update), env)).json();
    expect(body).toMatchObject({ method: "editMessageMedia", message_id: 9, chat_id: 42, media: { type: "photo", media: "https://txgram.example/bot/funds.png?v=2", parse_mode: "HTML" } });
    expect(body.media.caption).toContain("Arbitrum Sepolia");
    expect(body.reply_markup.inline_keyboard.at(-1)[0].callback_data).toBe("page:home");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toContain("/answerCallbackQuery");
    expect(await (await worker.fetch(request(update), env)).json()).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("ranks public perp markets by actual volume and escapes symbols; excludes spot IDs", async () => {
    const fetcher = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      return Response.json({ success: true, data: body.type === "perpMeta" ? { universe: [
        { index: 1, baseCurrency: "BTC", delisted: false, haltTrading: false }, { index: 2, baseCurrency: "ETH<&>", delisted: false, haltTrading: false }, { index: 3, baseCurrency: "HALTED", haltTrading: true },
      ] } : { assetCtxs: [
        { instrumentId: 1, lastPrice: "80000", prevDayPx: "79000", dayNtlVlm: "100" }, { instrumentId: 2, lastPrice: "2400", prevDayPx: "2300", dayNtlVlm: "200" }, { instrumentId: 10000, lastPrice: "80000", dayNtlVlm: "999999" },
      ] } });
    }); vi.stubGlobal("fetch", fetcher);
    const body = await (await worker.fetch(request(message("/markets")), env)).json();
    expect(body.photo).toContain("/bot/markets.png");
    expect(body.caption).toMatch(/As of <tg-time unix="\d+" format="t">\d\d:\d\d:\d\d UTC<\/tg-time>/);
    expect(body.caption).toContain("ETH&lt;&amp;&gt;");
    expect(body.caption.indexOf("ETH")).toBeLessThan(body.caption.indexOf("BTC"));
    expect(body.caption).not.toContain("HALTED");
    expect(body.reply_markup.inline_keyboard[0]).toEqual([
      { text: "ETH<&>  ▲4.35%", web_app: { url: "https://txgram.example/?view=trade&asset=2" } },
      { text: "BTC  ▲1.27%", web_app: { url: "https://txgram.example/?view=trade&asset=1" } },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[0]![1] as RequestInit).signal).toBeDefined();
  });
  it("shows honest unavailable text when public market reads fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const body = await (await worker.fetch(request(message("/markets")), { ...env, TXFLOW_NETWORK: "mainnet" })).json();
    expect(body.caption).toContain("temporarily unavailable");
    expect(body.caption).not.toContain("Practice funds");
  });
  it("acknowledges unknown buttons and explains which market snapshot a refresh shows", async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => url.includes("/answerCallbackQuery") ? Response.json({ ok: true }) : Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetcher);
    const press = (data: string) => ({ update_id: ++sequence, callback_query: { id: `callback-${sequence}`, from: { id: 42 }, data, message: { message_id: 9, chat: { id: 42, type: "private" } } } });
    expect(await (await worker.fetch(request(press("stale:button")), env)).json()).toEqual({ ok: true });
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({ callback_query_id: `callback-${sequence}` });
    const body = await (await worker.fetch(request(press("page:markets")), { ...env, TXFLOW_NETWORK: "mainnet" })).json();
    expect(body.method).toBe("editMessageMedia");
    const toast = fetcher.mock.calls.map(([url, init]) => url.includes("/answerCallbackQuery") ? JSON.parse(init.body) : undefined).filter(Boolean).at(-1);
    expect(toast.text).toBe("Markets are temporarily unavailable");
  });
  it("keeps every card caption within Telegram's 1024-character limit", () => {
    for (const page of ["home", "guide", "funds", "portfolio", "help", "markets"] as const) for (const testnet of [true, false]) {
      expect(pageCard(page, env.MINIAPP_URL, testnet).caption.replace(/<[^>]+>/g, "").length).toBeLessThanOrEqual(1024);
    }
  });
  it("keeps existing SPA delivery and returns actual API errors rather than HTML", async () => {
    expect(await (await worker.fetch(new Request("https://txgram.example/portfolio"), env)).text()).toBe("mini app");
    expect((await worker.fetch(new Request("https://txgram.example/api/missing"), env)).status).toBe(404);
    expect((await worker.fetch(new Request("https://txgram.example/api/telegram/webhook"), env)).status).toBe(405);
    expect((await worker.fetch(request({ update_id: "invalid" }), env)).status).toBe(400);
    const health = await (await worker.fetch(new Request("https://txgram.example/api/telegram/health"), env)).json();
    expect(health.configured).toBe(true);
    expect(JSON.stringify(health)).not.toContain(env.TELEGRAM_WEBHOOK_SECRET);
    expect(health.tokenFingerprint).toBeUndefined();
  });
  it("only exposes configuration proof to an authenticated setup check", async () => {
    const url = "https://txgram.example/api/telegram/health";
    expect((await worker.fetch(new Request(url, { headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong" } }), env)).status).toBe(401);
    const body = await (await worker.fetch(new Request(url, { headers: { "X-Telegram-Bot-Api-Secret-Token": env.TELEGRAM_WEBHOOK_SECRET! } }), env)).json();
    expect(body.tokenFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain(env.TELEGRAM_BOT_TOKEN);
  });
});
describe("launch links and profile", () => {
  it("launch parameters only choose known screens and valid market IDs", () => {
    expect(parseLaunch("?view=trade&asset=2")).toEqual({ view: "trade", asset: 2 });
    expect(parseLaunch("?tgWebAppStartParam=market_1")).toEqual({ view: "trade", asset: 1 });
    expect(parseLaunch("?tgWebAppStartParam=portfolio")).toEqual({ view: "portfolio" });
    expect(parseLaunch("?view=withdraw&asset=-1&amount=100&confirm=true")).toEqual({ view: "home" });
    expect(parseLaunch("?view=trade&asset=1e10")).toEqual({ view: "trade" });
  });
  it("keeps profile copy within Telegram limits and refuses non-HTTPS app links", () => {
    expect(BOT_PROFILE.short_description.length).toBeLessThanOrEqual(120);
    expect(BOT_PROFILE.description.length).toBeLessThanOrEqual(512);
    expect(BOT_COMMANDS.map((c) => c.command)).toEqual(["start", "markets", "portfolio", "funds", "guide", "help"]);
    expect(() => pageCard("home", "javascript:alert(1)", true)).toThrow("HTTPS");
    expect(() => pageCard("home", "https://user:secret@example.com", true)).toThrow("HTTPS");
  });
});
