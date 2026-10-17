import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import type { BracketFormat } from '@dst/shared'
import { useCreatePlayer, useCreateTournament, usePlayers, useRulesets } from '../../api/queries'
import ui from '../../components/ui.module.css'
import s from './tournaments.module.css'

export function NewTournament() {
  const navigate = useNavigate()
  const players = usePlayers()
  const rulesets = useRulesets()
  const createTournament = useCreateTournament()
  const createPlayer = useCreatePlayer()

  const [name, setName] = useState('')
  const [rulesetId, setRulesetId] = useState('')
  const [kind, setKind] = useState<BracketFormat['kind']>('single')
  const [thirdPlace, setThirdPlace] = useState(false)
  const [grandFinalReset, setGrandFinalReset] = useState(false)
  const [seeding, setSeeding] = useState<'random' | 'manual'>('random')
  /** Selected player ids, in seed order. */
  const [selected, setSelected] = useState<string[]>([])
  const [newPlayer, setNewPlayer] = useState('')

  const effectiveRulesetId = rulesetId || rulesets.data?.[0]?.id || ''
  const nameOf = (id: string) => players.data?.find((p) => p.id === id)?.name ?? '?'
  const toggle = (id: string) =>
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const moveSeed = (index: number, delta: -1 | 1) =>
    setSelected((ids) => {
      const next = [...ids]
      const target = index + delta
      if (target < 0 || target >= next.length) return ids
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })

  const size = selected.length >= 2 ? 2 ** Math.ceil(Math.log2(selected.length)) : 0
  const byes = size - selected.length

  const submit = (e: FormEvent) => {
    e.preventDefault()
    createTournament.mutate(
      {
        name,
        rulesetId: effectiveRulesetId,
        playerIds: selected,
        seeding,
        format: kind === 'single' ? { kind, thirdPlace } : { kind, grandFinalReset },
      },
      { onSuccess: (tournament) => navigate(`/tournaments/${tournament.id}`) },
    )
  }

  const addPlayer = () =>
    createPlayer.mutate(
      { name: newPlayer },
      {
        onSuccess: (player) => {
          setNewPlayer('')
          setSelected((ids) => [...ids, player.id])
        },
      },
    )

  return (
    <form className={s.form} onSubmit={submit}>
      <h1>New tournament</h1>

      <div className={s.twoColumns}>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bell Cup 2026"
          />
        </label>
        <label className={ui.field}>
          <span className={ui.fieldLabel}>Ruleset (used for every match)</span>
          <select value={effectiveRulesetId} onChange={(e) => setRulesetId(e.target.value)}>
            {rulesets.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className={s.box}>
        <legend>Format</legend>
        <div className={s.options}>
          <label className={s.option}>
            <input type="radio" checked={kind === 'single'} onChange={() => setKind('single')} />
            <span>
              <strong>Single elimination</strong>
              <span className={s.muted}>Lose once and you're out.</span>
            </span>
          </label>
          <label className={s.option}>
            <input type="radio" checked={kind === 'double'} onChange={() => setKind('double')} />
            <span>
              <strong>Double elimination</strong>
              <span className={s.muted}>
                Lose once and you drop to the losers bracket. Lose twice and you're out.
              </span>
            </span>
          </label>
        </div>
        {kind === 'single' ? (
          <label className={s.check}>
            <input
              type="checkbox"
              checked={thirdPlace}
              onChange={(e) => setThirdPlace(e.target.checked)}
            />
            Play a match for third place
          </label>
        ) : (
          <label className={s.check}>
            <input
              type="checkbox"
              checked={grandFinalReset}
              onChange={(e) => setGrandFinalReset(e.target.checked)}
            />
            Grand final reset: if the losers-bracket player wins the grand final, play once more
          </label>
        )}
      </fieldset>

      <fieldset className={s.box}>
        <legend>Players</legend>
        <div className={s.playerPicker}>
          {players.data?.map((player) => (
            <label key={player.id} className={s.playerChip}>
              <input
                type="checkbox"
                checked={selected.includes(player.id)}
                onChange={() => toggle(player.id)}
              />
              {player.name}
            </label>
          ))}
        </div>
        <div className={s.addPlayer}>
          <input
            placeholder="New player name"
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (newPlayer.trim()) addPlayer()
              }
            }}
          />
          <button type="button" onClick={addPlayer} disabled={!newPlayer.trim()}>
            Add
          </button>
        </div>
        <p className={s.muted}>
          {selected.length < 2
            ? 'Pick at least two players.'
            : `${selected.length} players · bracket of ${size}${byes ? ` · ${byes} bye${byes > 1 ? 's' : ''} for the top seeds` : ''}`}
        </p>
      </fieldset>

      <fieldset className={s.box}>
        <legend>Seeding</legend>
        <div className={s.options}>
          <label className={s.check}>
            <input
              type="radio"
              checked={seeding === 'random'}
              onChange={() => setSeeding('random')}
            />
            Random
          </label>
          <label className={s.check}>
            <input
              type="radio"
              checked={seeding === 'manual'}
              onChange={() => setSeeding('manual')}
            />
            Manual (seed 1 is the favourite and meets the lowest seed first)
          </label>
        </div>
        {seeding === 'manual' && selected.length > 0 && (
          <ol className={s.seedList}>
            {selected.map((id, i) => (
              <li key={id}>
                <span className={s.seed}>{i + 1}</span>
                <span className={s.grow}>{nameOf(id)}</span>
                <button
                  type="button"
                  onClick={() => moveSeed(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveSeed(i, 1)}
                  disabled={i === selected.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      {createTournament.error && <p className={s.error}>{createTournament.error.message}</p>}
      <div>
        <button
          type="submit"
          className={ui.primary}
          disabled={
            !name.trim() || selected.length < 2 || !effectiveRulesetId || createTournament.isPending
          }
        >
          Create tournament
        </button>
      </div>
    </form>
  )
}
