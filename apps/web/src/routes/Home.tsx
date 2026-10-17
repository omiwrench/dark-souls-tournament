import { bySlot } from '@dst/shared'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { MatchSummary } from '@dst/shared'
import { queryKeys, useDeleteMatch, useMatches } from '../api/queries'
import { ConfirmButton } from '../components/ConfirmButton'
import { liveSocket } from '../live/socket'
import ui from '../components/ui.module.css'
import styles from './Home.module.css'

const STATUS_LABEL: Record<MatchSummary['status'], string> = {
  ready: 'Not started',
  live: 'Live',
  paused: 'Paused',
  tiebreaker: 'Tiebreaker',
  finished: 'Finished',
}

export function Home() {
  const matches = useMatches()
  const queryClient = useQueryClient()

  useEffect(
    () =>
      liveSocket.subscribeMatchList(
        () => void queryClient.invalidateQueries({ queryKey: queryKeys.matches }),
      ),
    [queryClient],
  )

  const ongoing = matches.data?.filter((m) => m.status !== 'finished') ?? []
  const finished = matches.data?.filter((m) => m.status === 'finished') ?? []

  return (
    <div className={styles.home}>
      <div className={styles.heading}>
        <h1>Matches</h1>
        <Link to="/matches/new" className={styles.newMatch}>
          New match
        </Link>
      </div>

      {matches.isPending && <p className={styles.muted}>Loading…</p>}
      {matches.isError && <p className={styles.muted}>Could not load matches.</p>}
      {matches.isSuccess && matches.data.length === 0 && (
        <p className={styles.empty}>
          No matches yet. Ashen one, <Link to="/matches/new">start the first one</Link>.
        </p>
      )}

      {ongoing.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Ongoing</h2>
          <MatchList matches={ongoing} />
        </section>
      )}
      {finished.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Finished</h2>
          <MatchList matches={finished} />
        </section>
      )}
    </div>
  )
}

function MatchList({ matches }: { matches: MatchSummary[] }) {
  const deleteMatch = useDeleteMatch()
  return (
    <ul className={styles.list}>
      {matches.map((match) => (
        <li key={match.id} className={styles.match}>
          <Link to={`/matches/${match.id}/host`} className={styles.matchLink}>
            <span className={styles.players}>
              <PlayerName match={match} slot={1} /> <span className={styles.vs}>vs</span>{' '}
              <PlayerName match={match} slot={2} />
            </span>
            <span className={styles.score}>
              {match.scores[0].toLocaleString()} – {match.scores[1].toLocaleString()}
            </span>
            <span className={styles.meta}>
              <span className={styles[match.status]}>{STATUS_LABEL[match.status]}</span> ·{' '}
              {match.rulesetName} · {new Date(match.createdAt).toLocaleString()}
            </span>
          </Link>
          <ConfirmButton
            className={ui.danger}
            onConfirm={() => deleteMatch.mutate(match.id)}
            confirmLabel="Delete?"
            aria-label="Delete match"
          >
            ✕
          </ConfirmButton>
        </li>
      ))}
    </ul>
  )
}

function PlayerName({ match, slot }: { match: MatchSummary; slot: 1 | 2 }) {
  const won = match.winner === slot
  return (
    <span className={won ? styles.winner : undefined}>
      {won && '👑 '}
      {bySlot(match.players, slot).name}
    </span>
  )
}
