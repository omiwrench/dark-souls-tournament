import type { ButtonHTMLAttributes } from 'react'
import { useConfirmClick } from '../hooks/useConfirmClick'
import ui from './ui.module.css'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
  onConfirm: () => void
  confirmLabel?: string
}

/** A button that needs a second click to act. */
export function ConfirmButton({
  onConfirm,
  confirmLabel = 'Confirm?',
  className,
  children,
  ...rest
}: Props) {
  const { armed, onClick } = useConfirmClick(onConfirm)
  return (
    <button
      {...rest}
      className={[className, armed && ui.confirming].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
