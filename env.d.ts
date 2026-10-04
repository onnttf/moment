/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the news API, e.g. `https://api.example.com`. Empty means the page's own origin. */
  readonly VITE_API_BASE?: string
}
