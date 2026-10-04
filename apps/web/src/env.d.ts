/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Map tiles, {z}/{x}/{y} template (0034). Defaults to OpenStreetMap. */
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build stamp injected by Vite's `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;
