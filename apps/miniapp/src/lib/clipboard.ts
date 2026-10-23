/** Some in-app browsers deny the async Clipboard API but allow copying a selection. */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  } catch { /* Fall back to a temporary selection in the WebView. */ }
  const previous = document.activeElement as HTMLElement | null;
  const input = document.createElement("textarea");
  input.value = text;
  input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
  input.setAttribute("aria-hidden", "true");
  document.body.append(input);
  input.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally { input.remove(); previous?.focus(); }
}
