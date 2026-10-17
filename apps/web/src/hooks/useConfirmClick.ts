import { useEffect, useState } from 'react'

/**
 * Two-click confirmation without a dialog: the first click arms the button for a few
 * seconds, the second one runs the action.
 */
export function useConfirmClick(action: () => void, timeoutMs = 3_000) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), timeoutMs)
    return () => clearTimeout(timer)
  }, [armed, timeoutMs])
  return {
    armed,
    onClick() {
      if (armed) {
        setArmed(false)
        action()
      } else {
        setArmed(true)
      }
    },
  }
}
