import type { CSSProperties } from 'react'
import { type Objective, type PlayerSlot, maxCount, bySlot } from '@dst/shared'
import ui from '../../components/ui.module.css'
import { useConfirmClick } from '../../hooks/useConfirmClick'
import { cx, playerColor, useHost } from './context'
import s from './host.module.css'

export function PlayerColumn({ slot, filter }: { slot: PlayerSlot; filter: string }) {
  const { state, detail, log, openPenalty } = useHost()
  const { ruleset } = detail
  const canLog = state.status !== 'ready' && state.status !== 'tiebreaker'
  const query = filter.trim().toLowerCase()
  const sideEvents = ruleset.sideEvents.filter((e) => e.scope === 'player')

  return (
    <section
      className={s.column}
      style={{ '--player': playerColor(detail, slot) } as CSSProperties}
      aria-label={bySlot(detail.players, slot).name}
    >
      <div className={s.quickActions}>
        <button
          className={s.deathButton}
          disabled={!canLog}
          onClick={() => log({ type: 'logDeath', player: slot })}
        >
          ☠ Death <kbd className={ui.kbd}>{slot}</kbd>
        </button>
        <button className={s.penaltyButton} disabled={!canLog} onClick={() => openPenalty(slot)}>
          Penalty
        </button>
        {sideEvents.map((sideEvent) => (
          <button
            key={sideEvent.id}
            className={s.sideEventButton}
            disabled={!canLog}
            onClick={() => log({ type: 'logSideEvent', player: slot, sideEventId: sideEvent.id })}
          >
            {sideEvent.name}
          </button>
        ))}
      </div>

      <div className={s.objectives}>
        {ruleset.categories.map((category) => {
          const objectives = ruleset.objectives.filter(
            (o) => o.categoryId === category.id && o.name.toLowerCase().includes(query),
          )
          if (!objectives.length) return null
          return (
            <div key={category.id} className={s.category}>
              <h3 className={s.categoryTitle}>{category.name}</h3>
              <div className={s.objectiveGrid}>
                {objectives.map((objective) => (
                  <ObjectiveButton
                    key={objective.id}
                    objective={objective}
                    slot={slot}
                    disabled={!canLog}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ObjectiveButton({
  objective,
  slot,
  disabled,
}: {
  objective: Objective
  slot: PlayerSlot
  disabled: boolean
}) {
  const { state, log } = useHost()
  const count = bySlot(state.players, slot).objectiveCounts[objective.id] ?? 0
  const max = maxCount(objective)
  const done = count >= max
  const complete = () => log({ type: 'completeObjective', player: slot, objectiveId: objective.id })
  // Ending the match deserves a second click.
  const confirm = useConfirmClick(complete)

  return (
    <button
      className={cx(
        s.objective,
        objective.endsMatch && s.ending,
        objective.tags.includes('boss') && s.boss,
        done && s.done,
        confirm.armed && ui.confirming,
      )}
      disabled={disabled || done}
      onClick={objective.endsMatch ? confirm.onClick : complete}
      title={objective.description}
    >
      <span className={s.objectiveName}>
        {confirm.armed ? 'Confirm? Ends the match' : objective.name}
      </span>
      <span className={s.objectiveMeta}>
        {objective.repeat.kind === 'repeatable' && count > 0 && (
          <span className={s.count}>
            ×{count}
            {max !== Infinity && `/${max}`}
          </span>
        )}
        {done && objective.repeat.kind === 'once' ? (
          <span className={s.check}>✓</span>
        ) : (
          <span className={s.points}>{objective.points.toLocaleString()}</span>
        )}
      </span>
    </button>
  )
}
