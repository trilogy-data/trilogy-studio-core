import { describe, expect, it } from 'vitest'
import {
  getEditorTypeForPath,
  normalizeRemoteEditorPath,
  supportsDirectJobsTarget,
  supportsEditorLocalExecution,
  supportsEditorSourceTag,
} from './fileTypes'

describe('fileTypes', () => {
  it('normalizes remote python paths with a .py suffix', () => {
    expect(normalizeRemoteEditorPath('raw/loaders/boston_loader', 'python')).toBe(
      'raw/loaders/boston_loader.py',
    )
  })

  it('detects python editor types from file paths', () => {
    expect(getEditorTypeForPath('raw/loaders/boston_loader.py')).toBe('python')
  })

  it('marks python files as editable but not locally executable or source-tagged', () => {
    expect(supportsEditorLocalExecution('python')).toBe(false)
    expect(supportsEditorSourceTag('python')).toBe(false)
  })

  it('blocks direct jobs execution for python targets', () => {
    expect(supportsDirectJobsTarget('raw/loaders/boston_loader.py')).toBe(false)
    expect(supportsDirectJobsTarget('raw/core.preql')).toBe(true)
  })
})
