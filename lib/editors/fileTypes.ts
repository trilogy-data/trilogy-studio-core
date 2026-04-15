export type EditorType = 'trilogy' | 'sql' | 'preql' | 'python'

export const getFileExtension = (path: string): string => {
  const dotIndex = path.lastIndexOf('.')
  return dotIndex === -1 ? '' : path.slice(dotIndex).toLowerCase()
}

const defaultRemoteExtension = (type: EditorType): '.preql' | '.sql' | '.py' => {
  switch (type) {
    case 'sql':
      return '.sql'
    case 'python':
      return '.py'
    default:
      return '.preql'
  }
}

export const normalizeRemoteEditorPath = (name: string, type: EditorType): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return trimmed
  }

  if (/\.(preql|sql|csv|py)$/i.test(trimmed)) {
    return trimmed
  }

  return `${trimmed}${defaultRemoteExtension(type)}`
}

export const getEditorTypeForPath = (path: string): EditorType | null => {
  switch (getFileExtension(path)) {
    case '.preql':
      return 'preql'
    case '.sql':
      return 'sql'
    case '.py':
      return 'python'
    default:
      return null
  }
}

export const getMonacoLanguageForEditorType = (
  type: EditorType | string,
): 'trilogy' | 'sql' | 'python' => {
  switch (type) {
    case 'sql':
      return 'sql'
    case 'python':
      return 'python'
    default:
      return 'trilogy'
  }
}

export const supportsEditorValidation = (type: EditorType | string): boolean =>
  type === 'trilogy' || type === 'preql'

export const supportsEditorFormatting = (type: EditorType | string): boolean =>
  type === 'trilogy' || type === 'preql'

export const supportsEditorSourceTag = (type: EditorType | string): boolean =>
  type === 'trilogy' || type === 'preql'

export const supportsEditorAssistant = (type: EditorType | string): boolean =>
  type === 'trilogy' || type === 'preql' || type === 'sql'

export const supportsEditorLocalExecution = (type: EditorType | string): boolean =>
  type !== 'python'

export const supportsDirectJobsTarget = (target: string): boolean =>
  getFileExtension(target) !== '.py'
