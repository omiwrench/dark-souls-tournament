import type { CSSProperties } from 'react'
import { type TimelineEntry, formatMatchTime, isUndoable, bySlot } from '@dst/shared'
import { cx, formatPoints, playerColor, useHost } from './context'
import s from './host.module.css'

const AMENDABLE = new Set(['objective.completed', 'death', 'penalty', 'sideEvent'])

/** Every event, newest first, with undo and edit. */
export function EventFeed() {
  const { state } = useHost()
  const entries = [...state.timeline].reverse()
  return (
    <section className={s.feed} aria-label="Event feed">
      <h2 className={s.feedTitle}>Events</h2>
      {entries.length === 0 && <p className={s.feedEmpty}>Nothing has happened yet.</p>}
      <ol className={s.feedList}>
        {entries.map((entry) => (
          <FeedEntry key={entry.seq} entry={entry} />
        ))}
      </ol>
    </section>
  )
}

function FeedEntry({ entry }: { entry: TimelineEntry }) {
  const { detail, run, openEdit } = useHost()
  const voided = entry.status === 'voided'
  const canUndo = !voided && isUndoable(entry.body)
  const canEdit = !voided && AMENDABLE.has(entry.body.type)

  return (
    <li
      className={cx(s.entry, voided && s.entryVoided, entry.status === 'ignored' && s.entryIgnored)}
      style={
        entry.player
          ? ({ '--player': playerColor(detail, entry.player) } as CSSProperties)
          : undefined
      }
      title={entry.ignoredReason}
    >
      <span className={s.entryTime}>{formatMatchTime(entry.matchTimeMs)}</span>
      <span className={s.entryText}>
        {entry.player && (
          <span className={s.entryPlayer}>{bySlot(detail.players, entry.player).name}</span>
        )}
        <span className={s.entryLabel}>
          {entry.label}
          {entry.amended && <span className={s.entryNote}> (edited)</span>}
          {voided && <span className={s.entryNote}> (undone)</span>}
          {entry.ignoredReason && <span className={s.entryNote}> ({entry.ignoredReason})</span>}
        </span>
        {!voided &&
          entry.callouts.map((callout, i) => (
            <span key={i} className={s.entryCallout}>
              🍺 {callout.text}
            </span>
          ))}
      </span>
      <span className={s.entrySide}>
        {entry.pointsDelta !== 0 && !voided && (
          <span className={s.entryPoints}>{formatPoints(entry.pointsDelta)}</span>
        )}
        <span className={s.entryActions}>
          {canEdit && (
            <button onClick={() => openEdit(entry.seq)} title="Edit" aria-label="Edit event">
              ✎
            </button>
          )}
          {canUndo && (
            <button
              onClick={() => run({ type: 'undo', targetSeq: entry.seq })}
              title="Undo"
              aria-label="Undo event"
            >
              ↶
            </button>
          )}
        </span>
      </span>
    </li>
  )
}
