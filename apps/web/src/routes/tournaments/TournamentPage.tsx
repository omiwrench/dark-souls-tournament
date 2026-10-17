import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import {
  type BracketNode,
  type Entrant,
  type MatchSummary,
  type NodeMatch,
  type PlayerRecord,
  type ResolvedNode,
  type TournamentDetail,
  resolveBracket,
  roundName,
} from '@dst/shared'
import { queryKeys, useDeleteTournament, useOpenNodeMatch, useTournament } from '../../api/queries'
import { ConfirmButton } from '../../components/ConfirmButton'
import ui from '../../components/ui.module.css'
import { liveSocket } from '../../live/socket'
import { formatLabel } from './format'
import s from './tournaments.module.css'

export function TournamentPage() {
  const { id } = useParams() as { id: string }
  const tournament = useTournament(id)
  const queryClient = useQueryClient()

  // Results change as matches are played anywhere; refresh when the match list changes.
  useEffect(
    () =>
      liveSocket.subscribeMatchList(
        () => void queryClient.invalidateQueries({ queryKey: [...queryKeys.tournaments, id] }),
      ),
    [id, queryClient],
  )

  if (tournament.isError) return <p className={s.muted}>Could not load the tournament.</p>
  if (!tournament.data) return <p className={s.muted}>Loading…</p>
  return <Tournament detail={tournament.data} />
}

function Tournament({ detail }: { detail: TournamentDetail }) {
  const navigate = useNavigate()
  const remove = useDeleteTournament()

  const resolved = useMemo(() => {
    const byNode = new Map<string, NodeMatch>()
    for (const match of detail.matches) {
      if (match.bracketNodeId) {
        byNode.set(match.bracketNodeId, {
          matchId: match.id,
          finished: match.status === 'finished',
          winner: match.winner,
        })
      }
    }
    return resolveBracket(
      detail.bracket,
      detail.seeding.map((p) => p.id),
      byNode,
    )
  }, [detail])

  const players = new Map(detail.seeding.map((p, i) => [p.id, { ...p, seed: i + 1 }]))
  const matchesByNode = new Map(detail.matches.map((m) => [m.bracketNodeId, m]))
  const sections = groupSections(detail.bracket.nodes, detail.bracket.format.kind)

  return (
    <div className={s.page}>
      <div className={s.heading}>
        <div>
          <Link to="/tournaments" className={s.back}>
            ← Tournaments
          </Link>
          <h1>{detail.name}</h1>
          <p className={s.muted}>
            {detail.seeding.length} players · {formatLabel(detail.format)} · {detail.rulesetName}
          </p>
        </div>
        <ConfirmButton
          className={ui.danger}
          confirmLabel="Delete with all its matches?"
          onConfirm={() => remove.mutate(detail.id, { onSuccess: () => navigate('/tournaments') })}
        >
          Delete
        </ConfirmButton>
      </div>

      {resolved.champion && (
        <div className={s.championBanner}>
          <div className={s.championTitle}>Victory achieved</div>
          <div className={s.championName}>👑 {players.get(resolved.champion)?.name}</div>
          <ol className={s.placements}>
            {resolved.placements
              .filter((p) => p.place > 1)
              .map((p) => (
                <li key={p.place}>
                  {p.place === 2 ? '🥈' : '🥉'}{' '}
                  {p.playerIds.map((pid) => players.get(pid)?.name).join(' & ')}
                </li>
              ))}
          </ol>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.title} className={s.bracketSection}>
          <h2 className={s.sectionTitle}>{section.title}</h2>
          <div className={s.rounds}>
            {section.rounds.map((round) => (
              <div key={round[0]!.id} className={s.round}>
                <h3 className={s.roundTitle}>{roundName(detail.bracket, round[0]!)}</h3>
                <div className={s.roundNodes}>
                  {round.map((node) => (
                    <NodeCard
                      key={node.id}
                      tournamentId={detail.id}
                      node={resolved.nodes.get(node.id)!}
                      match={matchesByNode.get(node.id)}
                      players={players}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Winners bracket, losers bracket and finals, each split into rounds. */
function groupSections(nodes: BracketNode[], kind: 'single' | 'double') {
  const roundsOf = (side: BracketNode['side']) => {
    const bySide = nodes.filter((n) => n.side === side)
    const rounds = [...new Set(bySide.map((n) => n.round))].sort((a, b) => a - b)
    return rounds.map((r) => bySide.filter((n) => n.round === r))
  }
  const finals = nodes.filter((n) => ['grandFinal', 'reset', 'thirdPlace'].includes(n.side))
  return [
    { title: kind === 'double' ? 'Winners bracket' : 'Bracket', rounds: roundsOf('winners') },
    ...(kind === 'double' ? [{ title: 'Losers bracket', rounds: roundsOf('losers') }] : []),
    ...(finals.length
      ? [{ title: kind === 'double' ? 'Finals' : 'Placement', rounds: finals.map((n) => [n]) }]
      : []),
  ].filter((section) => section.rounds.length > 0)
}

type SeededPlayer = PlayerRecord & { seed: number }

function NodeCard({
  tournamentId,
  node,
  match,
  players,
}: {
  tournamentId: string
  node: ResolvedNode
  match: MatchSummary | undefined
  players: Map<string, SeededPlayer>
}) {
  const navigate = useNavigate()
  const open = useOpenNodeMatch(tournamentId)
  const goToMatch = () =>
    open.mutate(node.node.id, { onSuccess: (m) => navigate(`/matches/${m.id}/host`) })

  return (
    <div className={`${s.node} ${s[node.state]}`}>
      {node.entrants.map((entrant, i) => (
        <EntrantRow
          key={i}
          entrant={entrant}
          players={players}
          score={match ? match.scores[i] : undefined}
          won={isSame(node.winner, entrant) && (node.state === 'done' || node.state === 'walkover')}
          lost={isSame(node.loser, entrant) && node.state === 'done'}
        />
      ))}
      <div className={s.nodeFooter}>
        {node.state === 'ready' && (
          <button className={ui.primary} onClick={goToMatch} disabled={open.isPending}>
            Start match
          </button>
        )}
        {node.state === 'playing' && (
          <button onClick={goToMatch}>
            <span className={s.liveDot}>●</span>{' '}
            {match?.status === 'ready' ? 'Not started' : 'Live'} · Open
          </button>
        )}
        {node.state === 'done' && (
          <button className={s.linkButton} onClick={goToMatch}>
            View match
          </button>
        )}
        {node.state === 'waiting' && <span className={s.muted}>Waiting</span>}
        {node.state === 'walkover' && <span className={s.muted}>Bye</span>}
        {node.state === 'skipped' && <span className={s.muted}>Not needed</span>}
      </div>
      {open.error && <p className={s.error}>{open.error.message}</p>}
    </div>
  )
}

function EntrantRow({
  entrant,
  players,
  score,
  won,
  lost,
}: {
  entrant: Entrant
  players: Map<string, SeededPlayer>
  score: number | undefined
  won: boolean
  lost: boolean
}) {
  const player = entrant.kind === 'player' ? players.get(entrant.playerId) : undefined
  return (
    <div className={`${s.entrant} ${won ? s.won : ''} ${lost ? s.lost : ''}`}>
      <span className={s.seed}>{player?.seed ?? ''}</span>
      <span className={s.entrantName}>
        {player ? player.name : entrant.kind === 'bye' ? 'Bye' : 'TBD'}
      </span>
      {score !== undefined && <span className={s.entrantScore}>{score.toLocaleString()}</span>}
    </div>
  )
}

const isSame = (a: Entrant, b: Entrant) =>
  a.kind === 'player' && b.kind === 'player' && a.playerId === b.playerId
