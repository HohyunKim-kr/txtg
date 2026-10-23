/** Thin wrapper over `window.Telegram.WebApp` (telegram-web-app.js). */

type StorageCb<T> = (err: string | null, value?: T) => void;

interface KeyStorage {
  setItem(key: string, value: string, cb?: StorageCb<boolean>): void;
  getItem(key: string, cb: StorageCb<string | null>): void;
  removeItem(key: string, cb?: StorageCb<boolean>): void;
}

interface WebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string } };
  platform: string;
  version: string;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
  SecureStorage?: KeyStorage;
  DeviceStorage?: KeyStorage;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

const webApp = (): WebApp | undefined => window.Telegram?.WebApp;

/** True when opened inside a Telegram client (not just with the script loaded). */
export const inTelegram = () => Boolean(webApp()?.initData);

export function initTelegram() {
  const app = webApp();
  if (!app || !app.initData) return;
  app.ready();
  app.expand();
  app.disableVerticalSwipes?.();
  try {
    app.setHeaderColor("#080d00");
    app.setBackgroundColor("#080d00");
    app.setBottomBarColor?.("#080d00");
  } catch {
    // older clients reject custom colors
  }
}

export const telegramUser = () => webApp()?.initDataUnsafe.user;

const hf = () => {
  const app = webApp();
  return app?.initData && app.isVersionAtLeast("6.1") ? app.HapticFeedback : undefined;
};

export const haptic = {
  tap: () => hf()?.impactOccurred("light"),
  select: () => hf()?.selectionChanged(),
  success: () => hf()?.notificationOccurred("success"),
  error: () => hf()?.notificationOccurred("error"),
};

// ---------------------------------------------------------------------------
// Key storage: SecureStorage (Keychain / Keystore) → DeviceStorage → localStorage
// ---------------------------------------------------------------------------

function promisify(store: KeyStorage) {
  return {
    get: (key: string) =>
      new Promise<string | null>((res, rej) =>
        store.getItem(key, (err, v) => (err ? rej(new Error(err)) : res(v ?? null))),
      ),
    set: (key: string, value: string) =>
      new Promise<void>((res, rej) => store.setItem(key, value, (err) => (err ? rej(new Error(err)) : res()))),
    remove: (key: string) =>
      new Promise<void>((res, rej) => store.removeItem(key, (err) => (err ? rej(new Error(err)) : res()))),
  };
}

const local = {
  get: async (key: string) => localStorage.getItem(key),
  set: async (key: string, value: string) => localStorage.setItem(key, value),
  remove: async (key: string) => localStorage.removeItem(key),
};

export type StorageKind = "secure" | "device" | "local";

function stores(): { kind: StorageKind; s: typeof local }[] {
  const app = webApp();
  const out: { kind: StorageKind; s: typeof local }[] = [];
  if (app?.initData && app.isVersionAtLeast("9.0")) {
    if (app.SecureStorage) out.push({ kind: "secure", s: promisify(app.SecureStorage) });
    if (app.DeviceStorage) out.push({ kind: "device", s: promisify(app.DeviceStorage) });
  }
  out.push({ kind: "local", s: local });
  return out;
}

/** Reads from the first store that has the key. */
export async function readKey(key: string): Promise<string | null> {
  for (const { s } of stores()) {
    try {
      const v = await s.get(key);
      if (v) return v;
    } catch {
      // store unsupported on this client — try the next one
    }
  }
  return null;
}

/** Writes to the most secure store that accepts it. */
export async function writeKey(key: string, value: string): Promise<StorageKind> {
  for (const { kind, s } of stores()) {
    try {
      await s.set(key, value);
      return kind;
    } catch {
      // fall through
    }
  }
  throw new Error("no key storage available");
}

export async function removeKey(key: string): Promise<void> {
  await Promise.all(stores().map(({ s }) => s.remove(key).catch(() => undefined)));
}
