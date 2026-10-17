import { type RefObject, useEffect, useRef } from 'react'
import { lastUndoableSeq } from '@dst/shared'
import type { HostContextValue } from './context'

/** Is the user typing somewhere where keys should keep their normal meaning? */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * 1 / 2: death for player 1 / 2 · Space: pause/resume · Ctrl/Cmd+Z: undo · /: filter
 */
export function useHostShortcuts(
  host: HostContextValue,
  filterRef: RefObject<HTMLInputElement | null>,
) {
  // Read the latest values without re-binding the listener on every render.
  const hostRef = useRef(host)
  useEffect(() => {
    hostRef.current = host
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return
      const { state, run, log } = hostRef.current
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey

      if (e.key === ' ' && plain) {
        // Never let Space scroll or "click" the focused button.
        e.preventDefault()
        if (e.repeat) return
        if (state.status === 'live') void run({ type: 'pause' })
        else if (state.status === 'paused') void run({ type: 'resume' })
      } else if ((e.key === '1' || e.key === '2') && plain && !e.repeat) {
        if (state.status === 'ready' || state.status === 'tiebreaker') return
        log({ type: 'logDeath', player: e.key === '1' ? 1 : 2 })
      } else if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        const seq = lastUndoableSeq(state)
        if (seq !== null) void run({ type: 'undo', targetSeq: seq })
      } else if (e.key === '/' && plain) {
        e.preventDefault()
        filterRef.current?.focus()
      }
    }
    // Space activates buttons on key-up, so swallow that too.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTypingTarget(e.target) && !document.querySelector('dialog[open]')) {
        e.preventDefault()
      }
    }
    // Buttons shouldn't keep focus after a mouse click, or Space/Enter would press them again.
    const onPointerUp = (e: PointerEvent) => {
      if (e.target instanceof Element) e.target.closest('button')?.blur()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [filterRef])
}
