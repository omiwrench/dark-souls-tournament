import { type ReactNode, useEffect, useRef } from 'react'
import ui from './ui.module.css'

/** A modal built on the native <dialog> element: focus trapping and Esc come for free. */
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    ref.current?.showModal()
  }, [])
  return (
    <dialog
      ref={ref}
      className={ui.dialog}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) ref.current.close()
      }}
    >
      <h2 className={ui.dialogTitle}>{title}</h2>
      {children}
    </dialog>
  )
}
