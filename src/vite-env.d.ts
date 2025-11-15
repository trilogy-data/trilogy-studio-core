interface ImportMetaEnv {
  readonly VITE_DUCKDB_BUNDLED: string
  readonly VITE_DISABLE_TIPS_DEFAULT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
