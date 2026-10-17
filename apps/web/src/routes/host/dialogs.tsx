import { type FormEvent, useState } from 'react'
import {
  type Command,
  type PlayerSlot,
  type Variant,
  findObjective,
  formatMatchTime,
  parseMatchTime,
  bySlot,
} from '@dst/shared'
import { Dialog } from '../../components/Dialog'
import ui from '../../components/ui.module.css'
import { type LoggingCommand, cx, useHost } from './context'
import s from './host.module.css'

export function PenaltyDialog({ player, onClose }: { player: PlayerSlot; onClose: () => void }) {
  const { detail, log } = useHost()
  const [reason, setReason] = useState('')
  const [deduction, setDeduction] = useState('0')

  const give = (command: LoggingCommand) => {
    log(command)
    onClose()
  }
  const giveAdHoc = (e: FormEvent) => {
    e.preventDefault()
    give({ type: 'givePenalty', player, reason: reason.trim(), deduction: Number(deduction) || 0 })
  }

  return (
    <Dialog title={`Penalty for ${bySlot(detail.players, player).name}`} onClose={onClose}>
      {detail.ruleset.penalties.length > 0 && (
        <div className={s.dialogList}>
          {detail.ruleset.penalties.map((penalty) => (
            <button
              key={penalty.id}
              onClick={() => give({ type: 'givePenalty', player, penaltyId: penalty.id })}
            >
              {penalty.name}
              {penalty.deduction > 0 && ` (−${penalty.deduction.toLocaleString()})`}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={giveAdHoc}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Other reason</span>
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Points to deduct</span>
          <input
            type="number"
            min={0}
            step={50}
            value={deduction}
            onChange={(e) => setDeduction(e.target.value)}
          />
        </label>
        <div className={ui.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ui.primary} disabled={!reason.trim()}>
            Give penalty
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** Change an event's time, player or variants. */
export function EditEventDialog({ seq, onClose }: { seq: number; onClose: () => void }) {
  const { state, detail, run } = useHost()
  const entry = state.timeline.find((e) => e.seq === seq)
  const body = entry?.body
  const [time, setTime] = useState(entry ? formatMatchTime(entry.matchTimeMs) : '')
  const [player, setPlayer] = useState<PlayerSlot | undefined>(entry?.player)
  const [variantIds, setVariantIds] = useState<string[]>(
    body && 'variantIds' in body ? body.variantIds : [],
  )
  if (!entry || !body) return null

  let variants: Variant[] = []
  if (body.type === 'objective.completed') {
    variants = findObjective(detail.ruleset, body.objectiveId)?.variants ?? []
  } else if (body.type === 'death') {
    variants = detail.ruleset.deaths.variants
  }
  const parsedTime = parseMatchTime(time)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const commands: Command[] = []
    const original = 'variantIds' in body ? body.variantIds : []
    if (variants.length && [...variantIds].sort().join() !== [...original].sort().join()) {
      commands.push({ type: 'setVariants', targetSeq: seq, variantIds })
    }
    const changes: { matchTimeMs?: number; player?: PlayerSlot } = {}
    if (parsedTime !== null && parsedTime !== entry.matchTimeMs) changes.matchTimeMs = parsedTime
    if (player !== entry.player) changes.player = player
    if (Object.keys(changes).length) commands.push({ type: 'amend', targetSeq: seq, changes })

    for (const command of commands) {
      if (!(await run(command))) return
    }
    onClose()
  }

  return (
    <Dialog title={`Edit: ${entry.label}`} onClose={onClose}>
      <form onSubmit={save}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Match time (m:ss)</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} autoFocus />
          {parsedTime === null && <span className={s.fieldError}>Use m:ss, e.g. 12:30</span>}
        </label>
        {entry.player && (
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Player</span>
            <div className={s.chips}>
              {([1, 2] as const).map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={cx(ui.chip, player === slot && ui.chipOn)}
                  onClick={() => setPlayer(slot)}
                >
                  {bySlot(detail.players, slot).name}
                </button>
              ))}
            </div>
          </div>
        )}
        {variants.length > 0 && (
          <div className={ui.field}>
            <span className={ui.fieldLabel}>Variants</span>
            <div className={s.chips}>
              {variants.map((variant) => (
                <button
                  type="button"
                  key={variant.id}
                  className={cx(ui.chip, variantIds.includes(variant.id) && ui.chipOn)}
                  onClick={() =>
                    setVariantIds((ids) =>
                      ids.includes(variant.id)
                        ? ids.filter((id) => id !== variant.id)
                        : [...ids, variant.id],
                    )
                  }
                >
                  {variant.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={ui.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ui.primary} disabled={parsedTime === null}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/** After the end, new events need a time from before the end. */
export function BackdateDialog({
  command,
  onClose,
}: {
  command: LoggingCommand
  onClose: () => void
}) {
  const { state, run } = useHost()
  const endMs = state.end?.matchTimeMs ?? 0
  const [time, setTime] = useState(formatMatchTime(Math.max(0, endMs - 1_000)))
  const parsed = parseMatchTime(time)
  const valid = parsed !== null && parsed < endMs

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (valid && (await run({ ...command, matchTimeMs: parsed }, { toast: true }))) onClose()
  }

  return (
    <Dialog title="The match has ended" onClose={onClose}>
      <form onSubmit={submit}>
        <p className={s.dialogText}>
          When did this happen? It must be before the end ({formatMatchTime(endMs)}).
        </p>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Match time (m:ss)</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} autoFocus />
        </label>
        <div className={ui.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={ui.primary} disabled={!valid}>
            Log it
          </button>
        </div>
      </form>
    </Dialog>
  )
}
