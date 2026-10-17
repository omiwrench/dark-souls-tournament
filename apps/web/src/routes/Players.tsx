import { type FormEvent, useState } from 'react'
import type { PlayerRecord } from '@dst/shared'
import { useCreatePlayer, useDeletePlayer, usePlayers, useUpdatePlayer } from '../api/queries'
import { ConfirmButton } from '../components/ConfirmButton'
import ui from '../components/ui.module.css'
import styles from './Players.module.css'

export function Players() {
  const players = usePlayers()
  const createPlayer = useCreatePlayer()
  const [name, setName] = useState('')

  const add = (e: FormEvent) => {
    e.preventDefault()
    createPlayer.mutate({ name }, { onSuccess: () => setName('') })
  }

  return (
    <div className={styles.page}>
      <h1>Players</h1>

      <form className={styles.add} onSubmit={add}>
        <input
          placeholder="New player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New player name"
        />
        <button
          type="submit"
          className={ui.primary}
          disabled={!name.trim() || createPlayer.isPending}
        >
          Add player
        </button>
      </form>
      {createPlayer.error && <p className={styles.error}>{createPlayer.error.message}</p>}

      {players.isSuccess && players.data.length === 0 && (
        <p className={styles.muted}>No players yet. Every tournament needs some Chosen Undead.</p>
      )}
      <ul className={styles.list}>
        {players.data?.map((player) => (
          <PlayerRow key={player.id} player={player} />
        ))}
      </ul>
    </div>
  )
}

function PlayerRow({ player }: { player: PlayerRecord }) {
  const updatePlayer = useUpdatePlayer()
  const deletePlayer = useDeletePlayer()
  const [name, setName] = useState(player.name)

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed) return setName(player.name)
    if (trimmed !== player.name) updatePlayer.mutate({ id: player.id, name: trimmed })
  }

  const error = updatePlayer.error ?? deletePlayer.error
  return (
    <li className={styles.row}>
      <input
        type="color"
        className={styles.color}
        value={player.color ?? '#888888'}
        onChange={(e) => updatePlayer.mutate({ id: player.id, color: e.target.value })}
        aria-label={`Colour for ${player.name}`}
        title="Colour (used in the console)"
      />
      <input
        className={styles.name}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label="Name"
      />
      {player.color && (
        <button
          onClick={() => updatePlayer.mutate({ id: player.id, color: null })}
          title="Use the default player colours"
        >
          Default colour
        </button>
      )}
      <ConfirmButton
        className={ui.danger}
        onConfirm={() => deletePlayer.mutate(player.id)}
        confirmLabel="Delete?"
      >
        Delete
      </ConfirmButton>
      {error && <span className={styles.error}>{error.message}</span>}
    </li>
  )
}
