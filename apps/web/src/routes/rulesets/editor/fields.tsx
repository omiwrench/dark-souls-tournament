import { type InputHTMLAttributes, type ReactNode, useState } from 'react'
import type { Callout, CalloutTarget, DrinkKind, Variant } from '@dst/shared'
import ui from '../../../components/ui.module.css'
import { type Updater, focus, move, newId } from './draft'
import s from './editor.module.css'

export function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={s.section}>
      <h2 className={s.sectionTitle}>{title}</h2>
      {hint && <p className={s.hint}>{hint}</p>}
      {children}
    </section>
  )
}

/**
 * A whole-number input that lets you clear it or type a minus sign mid-edit, and only
 * reports valid numbers.
 */
export function NumberField({
  value,
  onChange,
  min,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min'> & {
  value: number
  onChange: (value: number) => void
  min?: number
}) {
  const [text, setText] = useState(String(value))
  // Show the outside value if it changed under us (undo, discard, …).
  const shown = Number(text) === value && text.trim() !== '' ? text : String(value)
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      value={shown}
      onChange={(e) => {
        setText(e.target.value)
        const parsed = Number(e.target.value)
        if (
          e.target.value.trim() !== '' &&
          Number.isInteger(parsed) &&
          (min === undefined || parsed >= min)
        ) {
          onChange(parsed)
        }
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

/** Like NumberField, but empty means "no value" (e.g. no maximum). */
export function OptionalNumberField({
  value,
  onChange,
  min,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min'> & {
  value: number | undefined
  onChange: (value: number | undefined) => void
  min?: number
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  const matches = value === undefined ? text.trim() === '' : Number(text) === value
  const shown = matches ? text : value === undefined ? '' : String(value)
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      value={shown}
      onChange={(e) => {
        setText(e.target.value)
        if (e.target.value.trim() === '') return onChange(undefined)
        const parsed = Number(e.target.value)
        if (Number.isInteger(parsed) && (min === undefined || parsed >= min)) onChange(parsed)
      }}
    />
  )
}

/** ↑ ↓ ✕ for an item in a list. */
export function ItemControls({
  index,
  count,
  onMove,
  onRemove,
  removeDisabled,
  removeTitle = 'Remove',
}: {
  index: number
  count: number
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
  removeDisabled?: boolean
  removeTitle?: string
}) {
  return (
    <span className={s.itemControls}>
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
        ↑
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={index === count - 1}
        aria-label="Move down"
      >
        ↓
      </button>
      <button
        type="button"
        className={ui.danger}
        onClick={onRemove}
        disabled={removeDisabled}
        aria-label={removeTitle}
        title={removeTitle}
      >
        ✕
      </button>
    </span>
  )
}

const TARGETS: { value: CalloutTarget; label: string }[] = [
  { value: 'actor', label: 'The player' },
  { value: 'opponent', label: 'The opponent' },
  { value: 'players', label: 'Both players' },
  { value: 'everyone', label: 'Everyone' },
]

const DRINKS: { value: DrinkKind | ''; label: string }[] = [
  { value: '', label: 'No drinks' },
  { value: 'sip', label: 'Sips' },
  { value: 'shot', label: 'Shots' },
  { value: 'finish', label: 'Finish drink' },
]

export function CalloutsEditor({
  callouts,
  update,
  withoutPlayer = false,
  addLabel = 'Add callout',
}: {
  callouts: Callout[]
  update: Updater<Callout[]>
  /** For events not about a player: only "both players" and "everyone" make sense. */
  withoutPlayer?: boolean
  addLabel?: string
}) {
  const targets = withoutPlayer
    ? TARGETS.filter((t) => t.value === 'players' || t.value === 'everyone')
    : TARGETS
  return (
    <div className={s.callouts}>
      {callouts.map((callout, i) => (
        <div key={i} className={s.callout}>
          <span className={s.calloutIcon} aria-hidden>
            🍺
          </span>
          <select
            value={callout.target}
            onChange={(e) =>
              update((d) => {
                d[i]!.target = e.target.value as CalloutTarget
              })
            }
            aria-label="Who it's for"
          >
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            className={s.calloutText}
            value={callout.text}
            placeholder={withoutPlayer ? 'Everyone drinks' : '{opponent} takes a shot'}
            onChange={(e) =>
              update((d) => {
                d[i]!.text = e.target.value
              })
            }
            aria-label="Callout text"
          />
          <select
            value={callout.drinks?.kind ?? ''}
            onChange={(e) =>
              update((d) => {
                const kind = e.target.value as DrinkKind | ''
                d[i]!.drinks = kind ? { kind, amount: d[i]!.drinks?.amount ?? 1 } : undefined
              })
            }
            aria-label="Drinks"
          >
            {DRINKS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {callout.drinks && (
            <NumberField
              className={s.small}
              min={1}
              value={callout.drinks.amount}
              onChange={(amount) =>
                update((d) => {
                  d[i]!.drinks!.amount = amount
                })
              }
              aria-label="How many"
            />
          )}
          <button
            type="button"
            className={ui.danger}
            onClick={() => update((d) => void d.splice(i, 1))}
            aria-label="Remove callout"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className={s.addButton}
        onClick={() =>
          update(
            (d) =>
              void d.push({
                target: withoutPlayer ? 'everyone' : 'actor',
                text: withoutPlayer ? 'Everyone drinks' : '{player} drinks',
                drinks: { kind: 'sip', amount: 1 },
              }),
          )
        }
      >
        + {addLabel}
      </button>
    </div>
  )
}

export function VariantsEditor({
  variants,
  update,
}: {
  variants: Variant[]
  update: Updater<Variant[]>
}) {
  return (
    <div className={s.variants}>
      {variants.map((variant, i) => (
        <div key={variant.id} className={s.variant}>
          <div className={s.row}>
            <input
              value={variant.name}
              placeholder="e.g. Parries only"
              onChange={(e) =>
                update((d) => {
                  d[i]!.name = e.target.value
                })
              }
              aria-label="Variant name"
            />
            <label className={s.inline}>
              Bonus
              <NumberField
                className={s.small}
                value={variant.bonusPoints}
                onChange={(bonusPoints) =>
                  update((d) => {
                    d[i]!.bonusPoints = bonusPoints
                  })
                }
              />
            </label>
            <select
              value={variant.calloutMode}
              onChange={(e) =>
                update((d) => {
                  d[i]!.calloutMode = e.target.value as Variant['calloutMode']
                })
              }
              aria-label="Callout mode"
            >
              <option value="add">Callouts add to the normal ones</option>
              <option value="replace">Callouts replace the normal ones</option>
            </select>
            <ItemControls
              index={i}
              count={variants.length}
              onMove={(delta) => update((d) => move(d, i, delta))}
              onRemove={() => update((d) => void d.splice(i, 1))}
              removeTitle="Remove variant"
            />
          </div>
          <CalloutsEditor
            callouts={variant.callouts}
            update={focus(update, (d) => d[i]!.callouts)}
          />
        </div>
      ))}
      <button
        type="button"
        className={s.addButton}
        onClick={() =>
          update(
            (d) =>
              void d.push({
                id: newId('var'),
                name: 'New variant',
                bonusPoints: 0,
                calloutMode: 'add',
                callouts: [],
              }),
          )
        }
      >
        + Add variant
      </button>
    </div>
  )
}
