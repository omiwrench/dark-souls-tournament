import { bySlot } from '@dst/shared'
import type { CSSProperties } from 'react'
import { ConfirmButton } from '../../components/ConfirmButton'
import { playerColor, useHost } from './context'
import s from './host.module.css'

/** Replaces the player columns while the match waits for the host to pick a winner. */
export function TiebreakerPanel() {
  const { state, detail, run } = useHost()
  return (
    <section className={s.tiebreaker}>
      <h2 className={s.tiebreakerTitle}>Tiebreaker</h2>
      <p className={s.tiebreakerInstruction}>
        {state.pendingTiebreaker?.instruction ?? 'The match is tied. Decide the winner.'}
      </p>
      <div className={s.tiebreakerButtons}>
        {([1, 2] as const).map((slot) => (
          <ConfirmButton
            key={slot}
            className={s.tiebreakerButton}
            style={{ '--player': playerColor(detail, slot) } as CSSProperties}
            onConfirm={() => run({ type: 'resolveTiebreaker', winner: slot })}
            confirmLabel={`${bySlot(detail.players, slot).name} wins?`}
          >
            {bySlot(detail.players, slot).name} wins
          </ConfirmButton>
        ))}
      </div>
    </section>
  )
}
