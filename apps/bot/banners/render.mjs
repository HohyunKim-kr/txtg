// Renders banner.html into the PNG cards served from apps/miniapp/public/bot/<page>.png.
// Requires Google Chrome (or set CHROME to a Chromium binary) and network access for fonts.
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const source = pathToFileURL(fileURLToPath(new URL("./banner.html", import.meta.url)));
const out = fileURLToPath(new URL("../../miniapp/public/bot/", import.meta.url));
for (const page of ["home", "markets", "portfolio", "funds", "guide", "help"]) {
  source.search = `?page=${page}`;
  execFileSync(chrome, ["--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1200,600",
    "--virtual-time-budget=5000", `--screenshot=${out}${page}.png`, source.href], { stdio: "ignore", timeout: 60_000 });
  process.stdout.write(`${page}.png\n`);
}
