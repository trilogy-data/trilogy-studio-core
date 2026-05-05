import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { isTauri } from './tauriKvBackend'

export interface TauriDirEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
}

/** Open the native directory picker. Returns the chosen absolute path
 *  or null if the user cancelled. Throws when called outside Tauri. */
export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) throw new Error('pickDirectory is only available in the Tauri shell')
  const result = await open({ directory: true, multiple: false })
  if (!result) return null
  // open() can return string or string[] depending on flags; we set
  // multiple:false so it's a string in the picked case.
  return Array.isArray(result) ? (result[0] ?? null) : result
}

export async function readDir(path: string): Promise<TauriDirEntry[]> {
  return invoke<TauriDirEntry[]>('fs_read_dir', { path })
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('fs_read_text', { path })
}
