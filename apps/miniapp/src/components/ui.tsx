import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { haptic } from "../lib/telegram";

type Variant = "primary" | "buy" | "sell" | "ghost" | "surface";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary active:bg-primary-hover",
  buy: "bg-buy text-on-primary active:opacity-80",
  sell: "bg-sell text-white active:opacity-80",
  surface: "bg-surface-2 text-label active:bg-surface-3",
  ghost: "bg-transparent text-label-2 active:text-label",
};

export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      onClick={(e) => {
        haptic.tap();
        onClick?.(e);
      }}
      className={`flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: { value: NoInfer<T>; label: ReactNode; activeClass?: string }[];
  onChange(v: NoInfer<T>): void;
  className?: string;
}) {
  return (
    <div className={`flex rounded-lg bg-surface p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => {
            haptic.select();
            onChange(o.value);
          }}
          className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition ${
            value === o.value ? (o.activeClass ?? "bg-surface-3 text-label") : "text-label-4"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose(): void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="animate-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="animate-sheet relative max-h-[85vh] overflow-hidden rounded-t-2xl border-t border-line-2 bg-fill pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-3" />
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="text-label-3 active:text-label" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[calc(85vh-56px)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    if (kind === "success") haptic.success();
    if (kind === "error") haptic.error();
    setToasts([{ id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-2 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade w-full max-w-sm rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-sell/40 bg-[#2a1214] text-sell"
                : t.kind === "success"
                  ? "border-primary/40 bg-[#0f2410] text-primary"
                  : "border-line-2 bg-surface text-label"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
