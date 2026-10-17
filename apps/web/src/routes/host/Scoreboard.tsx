import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import {
  type DrinkTally,
  type MatchState,
  type PlayerSlot,
  formatMatchTime,
  isCountingDown,
  matchTime,
  remainingTime,
  bySlot,
} from '@dst/shared'
import { ConfirmButton } from '../../components/ConfirmButton'
import ui from '../../components/ui.module.css'
import { useConnected } from '../../live/useConnection'
import { useServerNow } from '../../live/useNow'
import { cx, playerColor, useHost } from './context'
import s from './host.module.css'

const LOW_TIME_MS = 5 * 60_000

const DECIDED_BY: Record<string, string> = {
  points: 'on points',
  endedMatch: 'tiebreaker: ended the match',
  fewerDeaths: 'tiebreaker: fewer deaths',
  fewerPenalties: 'tiebreaker: fewer penalties',
  firstToFinalScore: 'tiebreaker: first to final score',
  manual: 'tiebreaker',
}

export function Scoreboard() {
  const { state, detail, run } = useHost()
  const connected = useConnected()
  const { status, result } = state
  const [p1, p2] = state.players
  const lead = p1.score - p2.score
  const leader: PlayerSlot = lead > 0 ? 1 : 2

  return (
    <header className={s.scoreboard}>
      <PlayerScore slot={1} />

      <div className={s.center}>
        <Clock state={state} />
        <div className={s.statusLine}>
          {status === 'ready' && 'Ready when you are'}
          {status === 'paused' && <span className={s.pausedLabel}>Paused · </span>}
          {(status === 'live' || status === 'paused') &&
            (lead === 0
              ? 'Even'
              : `${bySlot(detail.players, leader).name} leads by ${Math.abs(lead).toLocaleString()}`)}
          {status === 'tiebreaker' && 'Tied! Tiebreaker'}
          {status === 'finished' && result && (
            <span className={s.result}>
              👑 {bySlot(detail.players, result.winner).name} wins{' '}
              <span className={s.decidedBy}>({DECIDED_BY[result.decidedBy]})</span>
            </span>
          )}
        </div>
        <div className={s.controls}>
          <Link
            to={detail.tournamentId ? `/tournaments/${detail.tournamentId}` : '/'}
            className={s.homeLink}
            title={detail.tournamentId ? 'Back to the bracket' : 'Back to matches'}
          >
            ←
          </Link>
          {status === 'ready' && (
            <button className={ui.primary} onClick={() => run({ type: 'start' })}>
              Start match
            </button>
          )}
          {status === 'live' && (
            <button onClick={() => run({ type: 'pause' })}>
              Pause <kbd className={ui.kbd}>Space</kbd>
            </button>
          )}
          {status === 'paused' && (
            <button className={ui.primary} onClick={() => run({ type: 'resume' })}>
              Resume <kbd className={ui.kbd}>Space</kbd>
            </button>
          )}
          {(status === 'live' || status === 'paused') && (
            <ConfirmButton
              className={ui.danger}
              onConfirm={() => run({ type: 'endMatch' })}
              confirmLabel="End now?"
            >
              End match
            </ConfirmButton>
          )}
          {!connected && <span className={s.offline}>● Reconnecting…</span>}
        </div>
      </div>

      <PlayerScore slot={2} />
    </header>
  )
}

function PlayerScore({ slot }: { slot: PlayerSlot }) {
  const { state, detail } = useHost()
  const player = bySlot(state.players, slot)
  const won = state.result?.winner === slot
  return (
    <div
      className={cx(s.playerScore, slot === 2 && s.playerScoreRight, won && s.winner)}
      style={{ '--player': playerColor(detail, slot) } as CSSProperties}
    >
      <div className={s.playerName}>
        {won && '👑 '}
        {bySlot(detail.players, slot).name}
      </div>
      <div className={s.score}>{player.score.toLocaleString()}</div>
      <div className={s.playerStats}>
        <span title="Deaths">☠ {player.deaths}</span>
        <DrinkCount drinks={player.drinks} />
      </div>
    </div>
  )
}

export function DrinkCount({ drinks }: { drinks: DrinkTally }) {
  return (
    <>
      <span title="Sips">🍺 {drinks.sip}</span>
      <span title="Shots">🥃 {drinks.shot}</span>
      {drinks.finish > 0 && <span title="Drinks finished">🍻 {drinks.finish}</span>}
    </>
  )
}

/** Isolated so only the clock re-renders several times a second. */
function Clock({ state }: { state: MatchState }) {
  const now = useServerNow(200)
  const { clock } = state

  if (isCountingDown(clock, now)) {
    // Never show more than the configured countdown, even if the clocks are slightly apart.
    const started = state.events.find((e) => e.body.type === 'match.started')
    const countdownMs = started?.body.type === 'match.started' ? started.body.countdownMs : 3_000
    const seconds = Math.min(
      Math.ceil((clock.startsAt! - now) / 1000),
      Math.ceil(countdownMs / 1000),
    )
    return <div className={cx(s.clock, s.countdown)}>{seconds}</div>
  }

  const remaining = remainingTime(clock, now)
  const elapsed = matchTime(clock, now)
  const running = state.status === 'live'
  return (
    <div className={s.clockBlock}>
      <div
        className={cx(
          s.clock,
          !running && state.status !== 'ready' && s.clockStopped,
          running && remaining !== null && remaining <= LOW_TIME_MS && s.clockLow,
        )}
        title={remaining === null ? 'Elapsed' : 'Remaining'}
      >
        {formatMatchTime(remaining ?? elapsed)}
      </div>
      {remaining !== null && <div className={s.elapsed}>{formatMatchTime(elapsed)} elapsed</div>}
    </div>
  )
}
