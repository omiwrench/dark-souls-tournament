import { useCallback, useEffect, useRef, useState } from 'react'
import { type Variant, findObjective, bySlot } from '@dst/shared'
import ui from '../../components/ui.module.css'
import { cx, formatPoints, useHost } from './context'
import s from './host.module.css'

type ToastInput = { kind: 'event'; seq: number } | { kind: 'error'; message: string }
export type Toast = ToastInput & { id: number }

const MAX_TOASTS = 4

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++
    setToasts((t) => [...t, { ...toast, id }].slice(-MAX_TOASTS))
  }, [])
  return { toasts, push, dismiss }
}

export function Toasts({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className={s.toasts} aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} dismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: () => void }) {
  const [hovered, setHovered] = useState(false)
  useEffect(() => {
    if (hovered) return
    const timer = setTimeout(dismiss, toast.kind === 'error' ? 4_000 : 8_000)
    return () => clearTimeout(timer)
  }, [hovered, dismiss, toast.kind])

  return (
    <div
      className={cx(s.toast, toast.kind === 'error' && s.toastError)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role={toast.kind === 'error' ? 'alert' : 'status'}
    >
      {toast.kind === 'error' ? (
        <span>{toast.message}</span>
      ) : (
        <EventToast seq={toast.seq} dismiss={dismiss} />
      )}
    </div>
  )
}

/** "+500 Asylum Demon — Alice · Undo", with chips for adding variants after the fact. */
function EventToast({ seq, dismiss }: { seq: number; dismiss: () => void }) {
  const { state, detail, run } = useHost()
  const entry = state.timeline.find((e) => e.seq === seq)
  if (!entry || entry.status === 'voided') return <span>Undone</span>

  const { body } = entry
  let variants: Variant[] = []
  if (body.type === 'objective.completed') {
    variants = findObjective(detail.ruleset, body.objectiveId)?.variants ?? []
  } else if (body.type === 'death') {
    variants = detail.ruleset.deaths.variants
  }
  const selected = 'variantIds' in body ? body.variantIds : []
  const toggle = (id: string) =>
    run({
      type: 'setVariants',
      targetSeq: seq,
      variantIds: selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id],
    })

  return (
    <div className={s.toastBody}>
      <div className={s.toastLine}>
        {entry.pointsDelta !== 0 && <strong>{formatPoints(entry.pointsDelta)} </strong>}
        {entry.label}
        {entry.player && (
          <span className={s.toastWho}> — {bySlot(detail.players, entry.player).name}</span>
        )}
        <button
          className={s.toastUndo}
          onClick={() => {
            void run({ type: 'undo', targetSeq: seq })
            dismiss()
          }}
        >
          Undo
        </button>
      </div>
      {variants.length > 0 && (
        <div className={s.chips}>
          {variants.map((variant) => (
            <button
              key={variant.id}
              className={cx(ui.chip, selected.includes(variant.id) && ui.chipOn)}
              onClick={() => toggle(variant.id)}
            >
              {variant.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
