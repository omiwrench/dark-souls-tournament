import { useEffect, useMemo, useRef, useState } from 'react'
import { produce } from 'immer'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import type { Ruleset } from '@dst/shared'
import { useRuleset, useSaveRuleset } from '../../api/queries'
import { Dialog } from '../../components/Dialog'
import ui from '../../components/ui.module.css'
import { type Updater, blankRuleset, collectIssues, describePath } from './editor/draft'
import {
  DeathsSection,
  GeneralSection,
  ObjectivesSection,
  PenaltiesSection,
  SideEventsSection,
  TagCalloutsSection,
  TiebreakersSection,
} from './editor/sections'
import s from './editor/editor.module.css'

/** `/rulesets/new` and `/rulesets/:id`. */
export function RulesetEditorPage() {
  const { id } = useParams()
  const ruleset = useRuleset(id)
  if (!id) return <RulesetEditor initial={blankRuleset()} />
  if (ruleset.isError) return <p className={s.muted}>Could not load the ruleset.</p>
  if (!ruleset.data) return <p className={s.muted}>Loading…</p>
  return <RulesetEditor key={id} id={id} initial={ruleset.data.ruleset} />
}

function RulesetEditor({ id, initial }: { id?: string; initial: Ruleset }) {
  const navigate = useNavigate()
  const save = useSaveRuleset()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const update: Updater<Ruleset> = (recipe) => setDraft((d) => produce(d, recipe))

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])
  const issues = useMemo(() => collectIssues(draft), [draft])

  // Warn before leaving with unsaved changes: inside the app, and on reload/close.
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const submit = () =>
    save.mutate(
      { id, ruleset: draft },
      {
        onSuccess: ({ ruleset }) => {
          dirtyRef.current = false
          setSaved(ruleset)
          setDraft(ruleset)
          if (!id) navigate(`/rulesets/${ruleset.id}`, { replace: true })
        },
      },
    )

  const sectionProps = { ruleset: draft, update }
  return (
    <div className={s.editor}>
      <div className={s.heading}>
        <Link to="/rulesets" className={s.back}>
          ← Rulesets
        </Link>
        <h1>{draft.name || 'Untitled ruleset'}</h1>
        <p className={s.hint}>
          Matches keep a copy of the ruleset they started with, so editing never changes past
          results.
        </p>
      </div>

      <GeneralSection {...sectionProps} />
      <ObjectivesSection {...sectionProps} />
      <DeathsSection {...sectionProps} />
      <PenaltiesSection {...sectionProps} />
      <SideEventsSection {...sectionProps} />
      <TagCalloutsSection {...sectionProps} />
      <TiebreakersSection {...sectionProps} />

      <div className={s.saveBar}>
        <div className={s.saveStatus}>
          {issues.length > 0 ? (
            <details className={s.issues}>
              <summary>
                ⚠ {issues.length} problem{issues.length === 1 ? '' : 's'} to fix before saving
              </summary>
              <ul>
                {issues.map((issue, i) => (
                  <li key={i}>
                    <strong>{describePath(draft, issue.path)}:</strong> {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          ) : save.isError ? (
            <span className={s.error}>{save.error.message}</span>
          ) : dirty ? (
            <span>Unsaved changes</span>
          ) : (
            <span className={s.muted}>All changes saved</span>
          )}
        </div>
        <button type="button" onClick={() => setDraft(saved)} disabled={!dirty}>
          Discard
        </button>
        <button
          type="button"
          className={ui.primary}
          onClick={submit}
          disabled={(!dirty && !!id) || issues.length > 0 || save.isPending}
        >
          {id ? 'Save' : 'Create ruleset'}
        </button>
      </div>

      {blocker.state === 'blocked' && (
        <Dialog title="Unsaved changes" onClose={() => blocker.reset()}>
          <p>Leave without saving? Your changes to this ruleset will be lost.</p>
          <div className={ui.dialogActions}>
            <button type="button" onClick={() => blocker.reset()}>
              Stay
            </button>
            <button type="button" className={ui.danger} onClick={() => blocker.proceed()}>
              Leave
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
