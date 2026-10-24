export interface AppLaunch { view: "home" | "trade" | "portfolio"; asset?: number }

/** Launch parameters select a screen only; they never authorize or submit an action. */
export function parseLaunch(search: string): AppLaunch {
  const params = new URLSearchParams(search);
  const start = params.get("tgWebAppStartParam") ?? "";
  const view = params.get("view") ?? (start.startsWith("market_") ? "trade" : start);
  const asset = params.get("asset") ?? (start.startsWith("market_") ? start.slice(7) : "");
  const index = /^\d+$/.test(asset) ? Number(asset) : NaN;
  return { view: view === "portfolio" || view === "trade" ? view : "home",
    ...(view === "trade" && Number.isSafeInteger(index) && index > 0 ? { asset: index } : {}) };
}
