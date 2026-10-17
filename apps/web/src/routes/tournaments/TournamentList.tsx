import { Link } from 'react-router'
import { useTournaments } from '../../api/queries'
import { formatLabel } from './format'
import s from './tournaments.module.css'

export function TournamentList() {
  const tournaments = useTournaments()
  return (
    <div className={s.page}>
      <div className={s.heading}>
        <h1>Tournaments</h1>
        <Link to="/tournaments/new" className={s.newButton}>
          New tournament
        </Link>
      </div>
      {tournaments.isSuccess && tournaments.data.length === 0 && (
        <p className={s.muted}>No tournaments yet. Gather your Chosen Undead and start one.</p>
      )}
      <ul className={s.list}>
        {tournaments.data?.map((t) => (
          <li key={t.id}>
            <Link to={`/tournaments/${t.id}`} className={s.listLink}>
              <span className={s.listName}>{t.name}</span>
              <span className={s.muted}>
                {t.playerCount} players · {formatLabel(t.format)} · {t.rulesetName}
              </span>
              <span className={t.champion ? s.champion : s.muted}>
                {t.champion ? `👑 ${t.champion.name}` : 'In progress'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
