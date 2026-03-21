const ANSI_ESCAPE_PATTERN =
  // Matches common ANSI CSI / OSC terminal control sequences.
  /\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~])/g

export const stripTerminalControlCodes = (value: string | null | undefined): string => {
  if (!value) {
    return ''
  }

  return value.replace(ANSI_ESCAPE_PATTERN, '')
}

export const hasTerminalControlCodes = (value: string | null | undefined): boolean => {
  if (!value) {
    return false
  }

  ANSI_ESCAPE_PATTERN.lastIndex = 0
  return ANSI_ESCAPE_PATTERN.test(value)
}
