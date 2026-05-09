export type EditorType = 'trilogy' | 'sql' | 'preql' | 'python' | 'markdown' | 'csv'

export const getFileExtension = (path: string): string => {
  const dotIndex = path.lastIndexOf('.')
  return dotIndex === -1 ? '' : path.slice(dotIndex).toLowerCase()
}

const defaultRemoteExtension = (type: EditorType): '.preql' | '.sql' | '.py' | '.md' | '.csv' => {
  switch (type) {
    case 'sql':
      return '.sql'
    case 'python':
      return '.py'
    case 'markdown':
      return '.md'
    case 'csv':
      return '.csv'
    default:
      return '.preql'
  }
}

export const normalizeRemoteEditorPath = (name: string, type: EditorType): string => {
  const trimmed = name.trim()
  if (!trimmed) {
    return trimmed
  }

  if (/\.(preql|sql|csv|py|md|markdown|txt)$/i.test(trimmed)) {
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
    case '.md':
    case '.markdown':
    case '.txt':
      return 'markdown'
    case '.csv':
      return 'csv'
    default:
      return null
  }
}

export const getMonacoLanguageForEditorType = (
  type: EditorType | string,
): 'trilogy' | 'sql' | 'python' | 'markdown' => {
  switch (type) {
    case 'sql':
    case 'csv':
      return 'sql'
    case 'python':
      return 'python'
    case 'markdown':
      return 'markdown'
    default:
      return 'trilogy'
  }
}

export const isTrilogyType = (type: EditorType | string): boolean =>
  type === 'trilogy' || type === 'preql'

export const supportsEditorValidation = (type: EditorType | string): boolean => isTrilogyType(type)

export const supportsEditorFormatting = (type: EditorType | string): boolean => isTrilogyType(type)

export const supportsEditorSourceTag = (type: EditorType | string): boolean => isTrilogyType(type)

export const supportsEditorAssistant = (type: EditorType | string): boolean =>
  isTrilogyType(type) || type === 'sql'

export const supportsEditorLocalExecution = (type: EditorType | string): boolean =>
  type !== 'python' && type !== 'markdown' && type !== 'csv'

export const supportsDirectJobsTarget = (target: string): boolean => {
  const ext = getFileExtension(target)
  return ext !== '.py' && ext !== '.md' && ext !== '.csv'
}
