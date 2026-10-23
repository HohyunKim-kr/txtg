import { useState } from "react";
import { TOKEN_ICONS } from "../lib/token-icons";

export function TokenIcon({ symbol, className = "size-9" }: { symbol: string; className?: string }) {
  const token = symbol === "1000BONK" ? "BONK" : symbol.toUpperCase();
  const [failed, setFailed] = useState<string>();
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-[10px] font-semibold text-label-2 ${className}`}>
    {TOKEN_ICONS[token] && failed !== token
      ? <img src={`/tokens/${token.toLowerCase()}${TOKEN_ICONS[token]}`} alt="" className="size-full object-contain" loading="lazy" onError={() => setFailed(token)} />
      : token.slice(0, 3)}
  </span>;
}
