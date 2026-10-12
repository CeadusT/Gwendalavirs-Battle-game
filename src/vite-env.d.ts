/// <reference types="vite/client" />

interface Window {
  /** Exposé par electron/preload.cjs (absent dans un simple navigateur). */
  gwb?: { platform: string };
}
