import { bySlot } from '@dst/shared'
import { createContext, useContext } from 'react'
import type { Command, MatchDetail, MatchState, PlayerSlot } from '@dst/shared'

/** Commands that record something from the game, and can be backdated after the end. */
export type LoggingCommand = Extract<
  Command,
  { type: 'completeObjective' | 'logDeath' | 'givePenalty' | 'logSideEvent' }
>

export type HostContextValue = {
  detail: MatchDetail
  state: MatchState
  /** Sends a command; failures show up as error toasts. Resolves with success. */
  run: (command: Command, options?: { toast?: boolean }) => Promise<boolean>
  /** Logs a game event, asking for a time first if the match has already ended. */
  log: (command: LoggingCommand) => void
  openPenalty: (player: PlayerSlot) => void
  openEdit: (seq: number) => void
}

export const HostContext = createContext<HostContextValue | null>(null)

export function useHost() {
  const value = useContext(HostContext)
  if (!value) throw new Error('useHost must be used inside the host console')
  return value
}

export function playerColor(detail: MatchDetail, slot: PlayerSlot) {
  return bySlot(detail.players, slot).color ?? `var(--color-player-${slot})`
}

export const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(' ')

export const formatPoints = (points: number) =>
  `${points > 0 ? '+' : points < 0 ? '−' : '±'}${Math.abs(points).toLocaleString()}`
