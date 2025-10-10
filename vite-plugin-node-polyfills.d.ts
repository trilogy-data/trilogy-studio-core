declare module 'vite-plugin-node-polyfills' {
  import { Plugin } from 'vite'

  export interface NodePolyfillsOptions {
    include?: string[]
    exclude?: string[]
    globals?: {
      Buffer?: boolean
      global?: boolean
      process?: boolean
    }
    protocolImports?: boolean
  }

  export function nodePolyfills(options?: NodePolyfillsOptions): Plugin
}
