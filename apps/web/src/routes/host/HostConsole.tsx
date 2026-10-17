import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { type Command, type MatchEvent, type PlayerSlot, isUndoable } from '@dst/shared'
import ui from '../../components/ui.module.css'
import { useLiveMatch } from '../../live/useLiveMatch'
import { CalloutBanner } from './CalloutBanner'
import { HostContext, type HostContextValue, type LoggingCommand, cx, useHost } from './context'
import { BackdateDialog, EditEventDialog, PenaltyDialog } from './dialogs'
import { EventFeed } from './EventFeed'
import { PlayerColumn } from './PlayerColumn'
import { Scoreboard } from './Scoreboard'
import { TiebreakerPanel } from './TiebreakerPanel'
import { Toasts, useToasts } from './Toasts'
import { useHostShortcuts } from './useHostShortcuts'
import s from './host.module.css'

type OpenDialog =
  | { kind: 'penalty'; player: PlayerSlot }
  | { kind: 'edit'; seq: number }
  | { kind: 'backdate'; command: LoggingCommand }
  | null

export function HostConsole() {
  const { id } = useParams() as { id: string }
  return <LiveHostConsole key={id} id={id} />
}

function LiveHostConsole({ id }: { id: string }) {
  const { detail, state, send, error } = useLiveMatch(id)

  if (error) {
    return (
      <div className={s.message}>
        <p>Could not load the match: {error.message}</p>
        <Link to="/">Back to matches</Link>
      </div>
    )
  }
  if (!detail || !state) return <div className={s.message}>Loading…</div>
  return <Console detail={detail} state={state} send={send} />
}

/** The console for a loaded match. Exported for tests. */
export function Console({
  detail,
  state,
  send,
}: Pick<HostContextValue, 'detail' | 'state'> & {
  send: (command: Command) => Promise<MatchEvent[]>
}) {
  const { toasts, push, dismiss } = useToasts()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [filter, setFilter] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)

  const run = useCallback<HostContextValue['run']>(
    async (command, options) => {
      try {
        const events = await send(command)
        const logged = events.find((e) => isUndoable(e.body))
        if (options?.toast && logged) push({ kind: 'event', seq: logged.seq })
        return true
      } catch (e) {
        push({ kind: 'error', message: (e as Error).message })
        return false
      }
    },
    [send, push],
  )

  const ended = state.end !== null
  const log = useCallback<HostContextValue['log']>(
    (command) => {
      if (ended) setDialog({ kind: 'backdate', command })
      else void run(command, { toast: true })
    },
    [ended, run],
  )

  const host = useMemo<HostContextValue>(
    () => ({
      detail,
      state,
      run,
      log,
      openPenalty: (player) => setDialog({ kind: 'penalty', player }),
      openEdit: (seq) => setDialog({ kind: 'edit', seq }),
    }),
    [detail, state, run, log],
  )
  useHostShortcuts(host, filterRef)
  const closeDialog = () => setDialog(null)

  return (
    <HostContext.Provider value={host}>
      <div className={s.console}>
        <div className={s.scoreboardWrap}>
          <Scoreboard />
          <CalloutBanner callouts={state.callouts} />
        </div>

        <div className={s.toolbar}>
          <input
            ref={filterRef}
            className={s.filter}
            placeholder="Filter objectives…  ( / )"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilter('')
                e.currentTarget.blur()
              }
            }}
          />
          <span className={s.hints}>
            <kbd className={ui.kbd}>1</kbd> <kbd className={ui.kbd}>2</kbd> death ·{' '}
            <kbd className={ui.kbd}>Space</kbd> pause · <kbd className={ui.kbd}>Ctrl+Z</kbd> undo
          </span>
        </div>

        {state.status === 'tiebreaker' ? (
          <div className={cx(s.body, s.bodyTiebreaker)}>
            <TiebreakerPanel />
            <CenterColumn toasts={<Toasts toasts={toasts} dismiss={dismiss} />} />
          </div>
        ) : (
          <div className={s.body}>
            <PlayerColumn slot={1} filter={filter} />
            <CenterColumn toasts={<Toasts toasts={toasts} dismiss={dismiss} />} />
            <PlayerColumn slot={2} filter={filter} />
          </div>
        )}
      </div>

      {dialog?.kind === 'penalty' && <PenaltyDialog player={dialog.player} onClose={closeDialog} />}
      {dialog?.kind === 'edit' && <EditEventDialog seq={dialog.seq} onClose={closeDialog} />}
      {dialog?.kind === 'backdate' && (
        <BackdateDialog command={dialog.command} onClose={closeDialog} />
      )}
    </HostContext.Provider>
  )
}

/** General side events and the feed. Toasts live here too, so they never cover controls. */
function CenterColumn({ toasts }: { toasts: ReactNode }) {
  const host = useHost()
  const general = host.detail.ruleset.sideEvents.filter((e) => e.scope === 'general')
  const canLog = host.state.status !== 'ready' && host.state.status !== 'tiebreaker'
  return (
    <div className={s.centerColumn}>
      {general.length > 0 && (
        <div className={s.generalEvents}>
          {general.map((sideEvent) => (
            <button
              key={sideEvent.id}
              disabled={!canLog}
              onClick={() => host.log({ type: 'logSideEvent', sideEventId: sideEvent.id })}
            >
              {sideEvent.name}
            </button>
          ))}
        </div>
      )}
      <EventFeed />
      {toasts}
    </div>
  )
}
