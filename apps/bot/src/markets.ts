import { NETWORKS, type MarketStats, type NetworkName, type PerpMarket } from "@txgram/txflow";
import { BACK, appLink, callback, escapeHtml, networkNote, openApp, pageCard, type BotButton, type BotCard } from "./content";

interface Snapshot { at: number; rows: { symbol: string; asset: number; price: number; change: number; volume: number }[] }
const snapshots = new Map<NetworkName, { until: number; snapshot: Promise<Snapshot> }>();
const number = (value: number, compact = false) => value.toLocaleString("en-US", compact ? { notation: "compact", maximumFractionDigits: 2 } : { maximumFractionDigits: value >= 1000 ? 1 : value >= 1 ? 3 : 6 });
const change = (value: number) => Number.isFinite(value) ? `${value > 0 ? "▲" : value < 0 ? "▼" : ""}${Math.abs(value).toFixed(2)}%` : "—";
/** The UTC clock time of a snapshot, also used as the fallback text of <tg-time>. */
export const clock = (at: number) => new Date(at).toISOString().slice(11, 19) + " UTC";

async function load(network: NetworkName): Promise<Snapshot> {
  const net = NETWORKS[network];
  const query = async <T>(body: object): Promise<T> => {
    const response = await fetch(`${net.httpUrl}/info`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-version": net.apiVersionHeader }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("Market service unavailable");
    const result = await response.json() as { success: boolean; data: T };
    if (!result.success) throw new Error("Market service unavailable");
    return result.data;
  };
  const [meta, snapshot] = await Promise.all([query<{ universe: PerpMarket[] }>({ type: "perpMeta" }), query<{ assetCtxs: MarketStats[] }>({ type: "webData2", user: "0x0000000000000000000000000000000000000001" })]);
  const byId = new Map(snapshot.assetCtxs.map((s) => [s.instrumentId, s]));
  const rows = meta.universe.filter((m) => !m.delisted && !m.haltTrading).flatMap((market) => {
    const stats = byId.get(market.index);
    const price = Number(stats?.lastPrice), volume = Number(stats?.dayNtlVlm), previous = Number(stats?.prevDayPx);
    if (!(price > 0 && volume > 0)) return [];
    return [{ symbol: market.baseCurrency, asset: market.index, price, volume, change: previous > 0 ? (price / previous - 1) * 100 : NaN }];
  }).sort((a, b) => b.volume - a.volume).slice(0, 5);
  if (!rows.length) throw new Error("No market stats");
  return { at: Date.now(), rows };
}

export async function marketCard(network: NetworkName, appUrl: string): Promise<BotCard & { updatedAt?: number }> {
  let entry = snapshots.get(network);
  if (!entry || entry.until < Date.now()) {
    const snapshot = load(network);
    entry = { until: Date.now() + 30_000, snapshot };
    snapshots.set(network, entry);
    void snapshot.catch(() => { if (snapshots.get(network)?.snapshot === snapshot) snapshots.delete(network); });
  }
  const testnet = network === "testnet";
  try {
    const { at, rows } = await entry.snapshot;
    const lines = rows.map((row) => `<b>${escapeHtml(row.symbol)}</b>  $${number(row.price)}  ${change(row.change)}  <i>· Vol $${number(row.volume, true)}</i>`);
    const time = `<tg-time unix="${Math.floor(at / 1000)}" format="t">${clock(at)}</tg-time>`;
    const caption = "<b>Popular markets</b>\nRanked by 24h volume.\n\n" + lines.join("\n") + `\n\nAs of ${time} · Tap a market to open it.` + networkNote(testnet);
    // Market buttons stay neutral; the arrow carries direction without implying a recommendation.
    const buttons: BotButton[] = rows.map((row) => ({ text: `${row.symbol}  ${change(row.change)}`, web_app: { url: appLink(appUrl, "trade", row.asset) } }));
    const pairs: BotButton[][] = [];
    for (let i = 0; i < buttons.length; i += 2) pairs.push(buttons.slice(i, i + 2));
    return { ...pageCard("markets", appUrl, testnet), caption, updatedAt: at,
      reply_markup: { inline_keyboard: [...pairs, [openApp(appUrl)], [callback("Refresh", "markets"), BACK]] } };
  } catch { return pageCard("markets", appUrl, testnet); }
}
