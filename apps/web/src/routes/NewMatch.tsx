import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router'
import { DS1_CLASSES, DS1_GIFTS, type PlayerSetup } from '@dst/shared'
import { ApiRequestError } from '../api/client'
import { useCreateMatch, useCreatePlayer, usePlayers, useRulesets } from '../api/queries'
import ui from '../components/ui.module.css'
import styles from './NewMatch.module.css'

type Side = { playerId: string; setup: PlayerSetup }

export function NewMatch() {
  const navigate = useNavigate()
  const players = usePlayers()
  const rulesets = useRulesets()
  const createMatch = useCreateMatch()
  const [rulesetId, setRulesetId] = useState('')
  const [sides, setSides] = useState<[Side, Side]>([
    { playerId: '', setup: {} },
    { playerId: '', setup: {} },
  ])

  const effectiveRulesetId = rulesetId || rulesets.data?.[0]?.id || ''
  const setSide = (index: 0 | 1, side: Side) =>
    setSides((current) => (index === 0 ? [side, current[1]] : [current[0], side]))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    createMatch.mutate(
      {
        player1Id: sides[0].playerId,
        player2Id: sides[1].playerId,
        rulesetId: effectiveRulesetId,
        playerSetup: [sides[0].setup, sides[1].setup],
      },
      { onSuccess: (match) => navigate(`/matches/${match.id}/host`) },
    )
  }

  const ready =
    sides[0].playerId &&
    sides[1].playerId &&
    sides[0].playerId !== sides[1].playerId &&
    effectiveRulesetId

  return (
    <form className={styles.form} onSubmit={submit}>
      <h1>New match</h1>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Ruleset</span>
        <select value={effectiveRulesetId} onChange={(e) => setRulesetId(e.target.value)}>
          {rulesets.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.sides}>
        {([0, 1] as const).map((index) => (
          <SidePicker
            key={index}
            index={index}
            side={sides[index]}
            otherPlayerId={sides[index === 0 ? 1 : 0].playerId}
            players={players.data ?? []}
            onChange={(side) => setSide(index, side)}
          />
        ))}
      </div>

      {createMatch.error && <p className={styles.error}>{createMatch.error.message}</p>}

      <div>
        <button type="submit" className={ui.primary} disabled={!ready || createMatch.isPending}>
          Create match
        </button>
      </div>
    </form>
  )
}

function SidePicker({
  index,
  side,
  otherPlayerId,
  players,
  onChange,
}: {
  index: 0 | 1
  side: Side
  otherPlayerId: string
  players: { id: string; name: string }[]
  onChange: (side: Side) => void
}) {
  const createPlayer = useCreatePlayer()
  const [newName, setNewName] = useState('')

  const addPlayer = () => {
    createPlayer.mutate(
      { name: newName },
      {
        onSuccess: (player) => {
          setNewName('')
          onChange({ ...side, playerId: player.id })
        },
      },
    )
  }

  return (
    <fieldset className={styles.side} data-slot={index + 1}>
      <legend>Player {index + 1}</legend>
      <p className={styles.hint}>{index === 0 ? 'Left TV' : 'Right TV'}</p>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Player</span>
        <select
          value={side.playerId}
          onChange={(e) => onChange({ ...side, playerId: e.target.value })}
        >
          <option value="">Choose…</option>
          {players.map((p) => (
            <option key={p.id} value={p.id} disabled={p.id === otherPlayerId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.addPlayer}>
        <input
          placeholder="New player name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (newName.trim()) addPlayer()
            }
          }}
        />
        <button
          type="button"
          onClick={addPlayer}
          disabled={!newName.trim() || createPlayer.isPending}
        >
          Add
        </button>
      </div>
      {createPlayer.error instanceof ApiRequestError && (
        <p className={styles.error}>{createPlayer.error.message}</p>
      )}

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Class (optional)</span>
        <select
          value={side.setup.class ?? ''}
          onChange={(e) =>
            onChange({
              ...side,
              setup: {
                ...side.setup,
                class: (e.target.value || undefined) as PlayerSetup['class'],
              },
            })
          }
        >
          <option value="">—</option>
          {DS1_CLASSES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className={ui.field}>
        <span className={ui.fieldLabel}>Starting gift (optional)</span>
        <select
          value={side.setup.gift ?? ''}
          onChange={(e) =>
            onChange({
              ...side,
              setup: { ...side.setup, gift: (e.target.value || undefined) as PlayerSetup['gift'] },
            })
          }
        >
          <option value="">—</option>
          {DS1_GIFTS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}
