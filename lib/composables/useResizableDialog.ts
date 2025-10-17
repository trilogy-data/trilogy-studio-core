import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface ResizableDialogOptions {
  initialWidth?: number
  initialHeight?: number
  minWidth?: number
  minHeight?: number
}

export interface ResizableDialogReturn {
  // Element refs
  editorElement: Ref<HTMLElement | null>

  // Dimension state
  editorWidth: Ref<number>
  editorHeight: Ref<number>
  editorTop: Ref<number>
  editorLeft: Ref<number>

  // Resize state
  isResizing: Ref<boolean>

  // Click outside state
  canCloseOnClickOutside: Ref<boolean>

  // Methods
  startResize: (e: MouseEvent, direction: string) => void

  // Style object for easy binding
  dialogStyle: Ref<{
    width: string
    height: string
    top: string
    left: string
    transform: string
  }>
}

/**
 * Calculate default dimensions based on viewport size
 * Desktop: 75% of viewport, Mobile: fixed size
 */
function getDefaultDimensions() {
  const isDesktop = window.innerWidth > 768
  if (isDesktop) {
    return {
      width: Math.floor(window.innerWidth * 0.75),
      height: Math.floor(window.innerHeight * 0.75),
    }
  } else {
    return {
      width: 800,
      height: 400,
    }
  }
}

/**
 * Composable for resizable dialog functionality
 * Handles resizing, positioning, and click-outside detection
 */
export function useResizableDialog(
  onCancel: () => void,
  options: ResizableDialogOptions = {},
): ResizableDialogReturn {
  const { initialWidth, initialHeight, minWidth = 400, minHeight = 200 } = options

  // Calculate defaults
  const defaultDimensions = getDefaultDimensions()

  // Element ref
  const editorElement = ref<HTMLElement | null>(null)

  // Dimension state
  const editorWidth = ref(initialWidth || defaultDimensions.width)
  const editorHeight = ref(initialHeight || defaultDimensions.height)
  const editorTop = ref(50) // % from top
  const editorLeft = ref(50) // % from left

  // Resize state
  const isResizing = ref(false)
  const resizeDirection = ref('')
  const startX = ref(0)
  const startY = ref(0)
  const startWidth = ref(0)
  const startHeight = ref(0)
  const startTop = ref(0)
  const startLeft = ref(0)

  // Click outside state
  const canCloseOnClickOutside = ref(true)

  // Computed style object
  const dialogStyle = ref({
    width: `${editorWidth.value}px`,
    height: `${editorHeight.value}px`,
    top: `${editorTop.value}%`,
    left: `${editorLeft.value}%`,
    transform: 'translate(-50%, -50%)',
  })

  // Update style when dimensions change
  function updateDialogStyle() {
    dialogStyle.value = {
      width: `${editorWidth.value}px`,
      height: `${editorHeight.value}px`,
      top: `${editorTop.value}%`,
      left: `${editorLeft.value}%`,
      transform: 'translate(-50%, -50%)',
    }
  }

  /**
   * Start resizing from a given direction
   */
  function startResize(e: MouseEvent, direction: string): void {
    if (!editorElement.value) return

    isResizing.value = true
    resizeDirection.value = direction
    startX.value = e.clientX
    startY.value = e.clientY
    startWidth.value = editorElement.value.offsetWidth
    startHeight.value = editorElement.value.offsetHeight

    const rect = editorElement.value.getBoundingClientRect()
    startTop.value = rect.top
    startLeft.value = rect.left

    canCloseOnClickOutside.value = false
    e.preventDefault()
  }

  /**
   * Handle resize mousemove
   */
  function handleResize(e: MouseEvent): void {
    if (!isResizing.value) return

    const direction = resizeDirection.value

    // Right edge - adjust width
    if (direction.includes('e')) {
      const newWidth = startWidth.value + (e.clientX - startX.value)
      editorWidth.value = Math.max(minWidth, newWidth)
    }

    // Left edge - adjust width and position
    if (direction.includes('w')) {
      const deltaX = e.clientX - startX.value
      const newWidth = startWidth.value - deltaX

      if (newWidth >= minWidth) {
        editorWidth.value = newWidth
        const overlay = document.querySelector('.editor-overlay') as HTMLElement
        if (overlay) {
          const containerWidth = overlay.offsetWidth
          const newLeftPx = startLeft.value + deltaX
          editorLeft.value = (newLeftPx / containerWidth) * 100
        }
      }
    }

    // Bottom edge - adjust height
    if (direction.includes('s')) {
      const newHeight = startHeight.value + (e.clientY - startY.value)
      editorHeight.value = Math.max(minHeight, newHeight)
    }

    // Top edge - adjust height and position
    if (direction.includes('n')) {
      const deltaY = e.clientY - startY.value
      const newHeight = startHeight.value - deltaY

      if (newHeight >= minHeight) {
        editorHeight.value = newHeight
      }
    }

    updateDialogStyle()
  }

  /**
   * Stop resizing
   */
  function stopResize(e?: MouseEvent): void {
    if (!isResizing.value) return

    isResizing.value = false
    resizeDirection.value = ''

    if (e) {
      e.stopPropagation()
    }

    // Reset click outside protection after a delay
    setTimeout(() => {
      canCloseOnClickOutside.value = true
    }, 100)
  }

  /**
   * Handle clicks outside the dialog
   */
  function handleClickOutside(event: MouseEvent): void {
    const popupElement = document.querySelector('.content-editor')
    if (!popupElement || !canCloseOnClickOutside.value) return

    if (isResizing.value) return

    // Check if click was outside the popup
    if (!popupElement.contains(event.target as Node)) {
      const rect = popupElement.getBoundingClientRect()
      const bufferZone = 50 // pixels buffer around the popup

      const isCloseToLeft = event.clientX >= rect.left - bufferZone && event.clientX <= rect.left
      const isCloseToRight = event.clientX >= rect.right && event.clientX <= rect.right + bufferZone
      const isCloseToTop = event.clientY >= rect.top - bufferZone && event.clientY <= rect.top
      const isCloseToBottom =
        event.clientY >= rect.bottom && event.clientY <= rect.bottom + bufferZone

      // Only close if click is outside buffer zone
      if (!(isCloseToLeft || isCloseToRight || isCloseToTop || isCloseToBottom)) {
        onCancel()
      }
    }
  }

  /**
   * Handle mouseup event
   */
  function handleMouseUp(e: MouseEvent): void {
    if (isResizing.value) {
      stopResize(e)
    }
  }

  // Setup and cleanup
  onMounted(() => {
    // Delay to avoid catching the opening click event
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 0)

    document.addEventListener('mousemove', handleResize)
    document.addEventListener('mouseup', handleMouseUp)
  })

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
    document.removeEventListener('mousemove', handleResize)
    document.removeEventListener('mouseup', handleMouseUp)
  })

  return {
    editorElement,
    editorWidth,
    editorHeight,
    editorTop,
    editorLeft,
    isResizing,
    canCloseOnClickOutside,
    startResize,
    dialogStyle,
  }
}
