interface ImportMetaEnv {
  readonly VITE_DUCKDB_BUNDLED: string
  readonly VITE_DISABLE_TIPS_DEFAULT: string
  readonly VITE_CARTO_BASEMAP_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
