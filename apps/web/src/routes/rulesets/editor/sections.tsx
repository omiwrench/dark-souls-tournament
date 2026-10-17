import { useState } from 'react'
import type { Objective, Ruleset, Tiebreaker, TiebreakerKind } from '@dst/shared'
import { type Updater, focus, move, newId } from './draft'
import {
  CalloutsEditor,
  ItemControls,
  NumberField,
  OptionalNumberField,
  Section,
  VariantsEditor,
} from './fields'
import ui from '../../../components/ui.module.css'
import s from './editor.module.css'

type Props = { ruleset: Ruleset; update: Updater<Ruleset> }

export function GeneralSection({ ruleset, update }: Props) {
  const minutes = ruleset.timeLimitMs === null ? 60 : Math.round(ruleset.timeLimitMs / 60_000)
  return (
    <Section title="General">
      <label className={ui.field}>
        <span className={ui.fieldLabel}>Name</span>
        <input
          value={ruleset.name}
          onChange={(e) =>
            update((d) => {
              d.name = e.target.value
            })
          }
        />
      </label>
      <label className={ui.field}>
        <span className={ui.fieldLabel}>Description (optional)</span>
        <textarea
          className={s.textarea}
          rows={2}
          value={ruleset.description ?? ''}
          onChange={(e) =>
            update((d) => {
              d.description = e.target.value || undefined
            })
          }
        />
      </label>
      <div className={s.row}>
        <label className={s.inline}>
          Time limit
          <NumberField
            className={s.small}
            min={1}
            value={minutes}
            disabled={ruleset.timeLimitMs === null}
            onChange={(value) =>
              update((d) => {
                d.timeLimitMs = value * 60_000
              })
            }
          />
          minutes
        </label>
        <label className={s.inline}>
          <input
            type="checkbox"
            checked={ruleset.timeLimitMs === null}
            onChange={(e) =>
              update((d) => {
                d.timeLimitMs = e.target.checked ? null : minutes * 60_000
              })
            }
          />
          No time limit
        </label>
      </div>
    </Section>
  )
}

export function ObjectivesSection({ ruleset, update }: Props) {
  const allTags = [...new Set(ruleset.objectives.flatMap((o) => o.tags))]
  return (
    <Section
      title="Objectives"
      hint="Grouped by category in the host console. Match-ending objectives end the match the moment they're logged."
    >
      <datalist id="ruleset-tags">
        {allTags.map((tag) => (
          <option key={tag} value={tag} />
        ))}
      </datalist>
      {ruleset.categories.map((category, ci) => {
        const indexes = ruleset.objectives
          .map((o, i) => (o.categoryId === category.id ? i : -1))
          .filter((i) => i !== -1)
        return (
          <div key={category.id} className={s.category}>
            <div className={s.categoryHeader}>
              <input
                className={s.categoryName}
                value={category.name}
                onChange={(e) =>
                  update((d) => {
                    d.categories[ci]!.name = e.target.value
                  })
                }
                aria-label="Category name"
              />
              <span className={s.muted}>{indexes.length} objectives</span>
              <ItemControls
                index={ci}
                count={ruleset.categories.length}
                onMove={(delta) => update((d) => move(d.categories, ci, delta))}
                onRemove={() => update((d) => void d.categories.splice(ci, 1))}
                removeDisabled={indexes.length > 0}
                removeTitle={
                  indexes.length > 0 ? 'Only empty categories can be removed' : 'Remove category'
                }
              />
            </div>
            {indexes.map((objectiveIndex, position) => (
              <ObjectiveCard
                key={ruleset.objectives[objectiveIndex]!.id}
                ruleset={ruleset}
                objective={ruleset.objectives[objectiveIndex]!}
                update={focus(update, (d) => d.objectives[objectiveIndex]!)}
                position={position}
                count={indexes.length}
                // Swap with the neighbouring objective in the same category.
                onMove={(delta) =>
                  update((d) => {
                    const other = indexes[position + delta]
                    if (other === undefined) return
                    ;[d.objectives[objectiveIndex], d.objectives[other]] = [
                      d.objectives[other]!,
                      d.objectives[objectiveIndex]!,
                    ]
                  })
                }
                onRemove={() => update((d) => void d.objectives.splice(objectiveIndex, 1))}
              />
            ))}
            <button
              type="button"
              className={s.addButton}
              onClick={() =>
                update(
                  (d) =>
                    void d.objectives.push({
                      id: newId('obj'),
                      name: 'New objective',
                      categoryId: category.id,
                      points: 100,
                      tags: [],
                      repeat: { kind: 'once' },
                      endsMatch: false,
                      variants: [],
                      callouts: [],
                    }),
                )
              }
            >
              + Add objective to {category.name || 'category'}
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() =>
          update((d) => void d.categories.push({ id: newId('cat'), name: 'New category' }))
        }
      >
        + Add category
      </button>
    </Section>
  )
}

function ObjectiveCard({
  ruleset,
  objective,
  update,
  position,
  count,
  onMove,
  onRemove,
}: {
  ruleset: Ruleset
  objective: Objective
  update: Updater<Objective>
  position: number
  count: number
  onMove: (delta: -1 | 1) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const extras = [
    objective.variants.length && `${objective.variants.length} variant(s)`,
    objective.callouts.length && `${objective.callouts.length} callout(s)`,
    objective.tags.length && objective.tags.map((t) => `#${t}`).join(' '),
  ].filter(Boolean)

  return (
    <div className={s.card}>
      <div className={s.row}>
        <button
          type="button"
          className={s.expand}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? '▾' : '▸'}
        </button>
        <input
          className={s.grow}
          value={objective.name}
          onChange={(e) =>
            update((d) => {
              d.name = e.target.value
            })
          }
          aria-label="Objective name"
        />
        {!open && extras.length > 0 && <span className={s.summary}>{extras.join(' · ')}</span>}
        <NumberField
          className={s.points}
          min={0}
          value={objective.points}
          onChange={(points) =>
            update((d) => {
              d.points = points
            })
          }
          aria-label="Points"
        />
        <span className={s.muted}>pts</span>
        <select
          value={objective.repeat.kind}
          disabled={objective.endsMatch}
          onChange={(e) =>
            update((d) => {
              d.repeat = e.target.value === 'once' ? { kind: 'once' } : { kind: 'repeatable' }
            })
          }
          aria-label="Repeat"
        >
          <option value="once">Once</option>
          <option value="repeatable">Repeatable</option>
        </select>
        {objective.repeat.kind === 'repeatable' && (
          <label className={s.inline}>
            max
            <OptionalNumberField
              className={s.small}
              min={1}
              placeholder="∞"
              value={objective.repeat.max}
              onChange={(max) =>
                update((d) => {
                  d.repeat = { kind: 'repeatable', max }
                })
              }
            />
          </label>
        )}
        <label className={s.inline} title="Logging this ends the match">
          <input
            type="checkbox"
            checked={objective.endsMatch}
            onChange={(e) =>
              update((d) => {
                d.endsMatch = e.target.checked
                if (e.target.checked) d.repeat = { kind: 'once' }
              })
            }
          />
          Ends match
        </label>
        <ItemControls
          index={position}
          count={count}
          onMove={onMove}
          onRemove={onRemove}
          removeTitle="Remove objective"
        />
      </div>

      {open && (
        <div className={s.details}>
          <div className={s.row}>
            <label className={`${ui.field} ${s.grow}`}>
              <span className={ui.fieldLabel}>Description (optional, shown as a tooltip)</span>
              <input
                value={objective.description ?? ''}
                onChange={(e) =>
                  update((d) => {
                    d.description = e.target.value || undefined
                  })
                }
              />
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Category</span>
              <select
                value={objective.categoryId}
                onChange={(e) =>
                  update((d) => {
                    d.categoryId = e.target.value
                  })
                }
              >
                {ruleset.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={ui.field}>
              <span className={ui.fieldLabel}>Tags (comma-separated)</span>
              <input
                list="ruleset-tags"
                // Uncontrolled while typing; the key resets it when the tags change elsewhere.
                key={objective.tags.join(',')}
                defaultValue={objective.tags.join(', ')}
                onBlur={(e) =>
                  update((d) => {
                    d.tags = [
                      ...new Set(
                        e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      ),
                    ]
                  })
                }
              />
            </label>
          </div>
          <h3 className={s.subTitle}>Callouts</h3>
          <CalloutsEditor callouts={objective.callouts} update={focus(update, (d) => d.callouts)} />
          <h3 className={s.subTitle}>Variants</h3>
          <p className={s.hint}>Details the host can add after logging, e.g. "Parries only".</p>
          <VariantsEditor variants={objective.variants} update={focus(update, (d) => d.variants)} />
        </div>
      )}
    </div>
  )
}

export function DeathsSection({ ruleset, update }: Props) {
  return (
    <Section title="Deaths" hint="Deaths are always counted. Variants are things like fall damage.">
      <label className={s.inline}>
        Points lost per death
        <NumberField
          className={s.small}
          min={0}
          value={ruleset.deaths.deduction}
          onChange={(deduction) =>
            update((d) => {
              d.deaths.deduction = deduction
            })
          }
        />
      </label>
      <h3 className={s.subTitle}>Callouts on every death</h3>
      <CalloutsEditor
        callouts={ruleset.deaths.callouts}
        update={focus(update, (d) => d.deaths.callouts)}
      />
      <h3 className={s.subTitle}>Variants</h3>
      <VariantsEditor
        variants={ruleset.deaths.variants}
        update={focus(update, (d) => d.deaths.variants)}
      />
    </Section>
  )
}

export function PenaltiesSection({ ruleset, update }: Props) {
  return (
    <Section
      title="Penalties"
      hint="Predefined penalties for the host. The host can always give a custom one too."
    >
      {ruleset.penalties.map((penalty, i) => (
        <div key={penalty.id} className={s.card}>
          <div className={s.row}>
            <input
              className={s.grow}
              value={penalty.name}
              onChange={(e) =>
                update((d) => {
                  d.penalties[i]!.name = e.target.value
                })
              }
              aria-label="Penalty name"
            />
            <label className={s.inline}>
              Points lost
              <NumberField
                className={s.small}
                min={0}
                value={penalty.deduction}
                onChange={(deduction) =>
                  update((d) => {
                    d.penalties[i]!.deduction = deduction
                  })
                }
              />
            </label>
            <ItemControls
              index={i}
              count={ruleset.penalties.length}
              onMove={(delta) => update((d) => move(d.penalties, i, delta))}
              onRemove={() => update((d) => void d.penalties.splice(i, 1))}
              removeTitle="Remove penalty"
            />
          </div>
          <CalloutsEditor
            callouts={penalty.callouts}
            update={focus(update, (d) => d.penalties[i]!.callouts)}
          />
        </div>
      ))}
      <button
        type="button"
        className={s.addButton}
        onClick={() =>
          update(
            (d) =>
              void d.penalties.push({
                id: newId('pen'),
                name: 'New penalty',
                deduction: 0,
                callouts: [],
              }),
          )
        }
      >
        + Add penalty
      </button>
    </Section>
  )
}

export function SideEventsSection({ ruleset, update }: Props) {
  return (
    <Section
      title="Side events"
      hint="Worth no points, just callouts. Player events are logged for one player; general ones for nobody in particular."
    >
      {ruleset.sideEvents.map((sideEvent, i) => (
        <div key={sideEvent.id} className={s.card}>
          <div className={s.row}>
            <input
              className={s.grow}
              value={sideEvent.name}
              onChange={(e) =>
                update((d) => {
                  d.sideEvents[i]!.name = e.target.value
                })
              }
              aria-label="Side event name"
            />
            <select
              value={sideEvent.scope}
              onChange={(e) =>
                update((d) => {
                  const scope = e.target.value as 'player' | 'general'
                  d.sideEvents[i]!.scope = scope
                  // General events have no player, so player targets make no sense.
                  if (scope === 'general') {
                    for (const callout of d.sideEvents[i]!.callouts) {
                      if (callout.target === 'actor' || callout.target === 'opponent') {
                        callout.target = 'players'
                      }
                    }
                  }
                })
              }
              aria-label="Scope"
            >
              <option value="player">For a player</option>
              <option value="general">General</option>
            </select>
            <ItemControls
              index={i}
              count={ruleset.sideEvents.length}
              onMove={(delta) => update((d) => move(d.sideEvents, i, delta))}
              onRemove={() => update((d) => void d.sideEvents.splice(i, 1))}
              removeTitle="Remove side event"
            />
          </div>
          <CalloutsEditor
            callouts={sideEvent.callouts}
            update={focus(update, (d) => d.sideEvents[i]!.callouts)}
            withoutPlayer={sideEvent.scope === 'general'}
          />
        </div>
      ))}
      <button
        type="button"
        className={s.addButton}
        onClick={() =>
          update(
            (d) =>
              void d.sideEvents.push({
                id: newId('side'),
                name: 'New side event',
                scope: 'player',
                callouts: [],
              }),
          )
        }
      >
        + Add side event
      </button>
    </Section>
  )
}

export function TagCalloutsSection({ ruleset, update }: Props) {
  return (
    <Section
      title="Tag callouts"
      hint={
        <>
          Callouts for every objective with a tag, e.g. <code>boss</code> → "Everyone drinks". They
          always fire, even with a replacing variant.
        </>
      }
    >
      {ruleset.tagCallouts.map((tagCallout, i) => (
        <div key={i} className={s.card}>
          <div className={s.row}>
            <label className={s.inline}>
              Tag
              <input
                list="ruleset-tags"
                value={tagCallout.tag}
                onChange={(e) =>
                  update((d) => {
                    d.tagCallouts[i]!.tag = e.target.value
                  })
                }
              />
            </label>
            <span className={s.muted}>
              {ruleset.objectives.filter((o) => o.tags.includes(tagCallout.tag)).length} objectives
            </span>
            <span className={s.grow} />
            <button
              type="button"
              className={ui.danger}
              onClick={() => update((d) => void d.tagCallouts.splice(i, 1))}
              aria-label="Remove tag callout"
            >
              ✕
            </button>
          </div>
          <CalloutsEditor
            callouts={tagCallout.callouts}
            update={focus(update, (d) => d.tagCallouts[i]!.callouts)}
          />
        </div>
      ))}
      <button
        type="button"
        className={s.addButton}
        onClick={() =>
          update(
            (d) =>
              void d.tagCallouts.push({
                tag: ruleset.objectives.flatMap((o) => o.tags)[0] ?? 'boss',
                callouts: [
                  {
                    target: 'everyone',
                    text: 'Everyone drinks',
                    drinks: { kind: 'sip', amount: 1 },
                  },
                ],
              }),
          )
        }
      >
        + Add tag callout
      </button>
    </Section>
  )
}

const TIEBREAKER_LABELS: Record<TiebreakerKind, string> = {
  endedMatch: 'The player who ended the match',
  fewerDeaths: 'Fewer deaths',
  fewerPenalties: 'Fewer penalties',
  firstToFinalScore: 'First to reach their final score',
  manual: 'Host decides (with an instruction)',
}

export function TiebreakersSection({ ruleset, update }: Props) {
  const used = new Set(ruleset.tiebreakers.map((t) => t.kind))
  const available = (Object.keys(TIEBREAKER_LABELS) as TiebreakerKind[]).filter((k) => !used.has(k))
  const hasManual = used.has('manual')
  return (
    <Section
      title="Tiebreakers"
      hint="Checked in order when the scores are equal. If none decides, the host picks the winner."
    >
      <ol className={s.tiebreakers}>
        {ruleset.tiebreakers.map((tiebreaker, i) => (
          <li key={tiebreaker.kind} className={s.row}>
            <span className={s.grow}>
              {TIEBREAKER_LABELS[tiebreaker.kind]}
              {tiebreaker.kind === 'manual' && (
                <input
                  className={s.instruction}
                  value={tiebreaker.instruction}
                  placeholder="e.g. Switch to Dark Souls 3, first to kill Iudex Gundyr wins"
                  onChange={(e) =>
                    update((d) => {
                      const t = d.tiebreakers[i]
                      if (t?.kind === 'manual') t.instruction = e.target.value
                    })
                  }
                  aria-label="Instruction"
                />
              )}
            </span>
            <ItemControls
              index={i}
              count={ruleset.tiebreakers.length}
              onMove={(delta) => update((d) => move(d.tiebreakers, i, delta))}
              onRemove={() => update((d) => void d.tiebreakers.splice(i, 1))}
              removeTitle="Remove tiebreaker"
            />
          </li>
        ))}
      </ol>
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) =>
            update((d) => {
              const kind = e.target.value as TiebreakerKind
              const tiebreaker: Tiebreaker =
                kind === 'manual' ? { kind, instruction: 'The host decides' } : { kind }
              // Nothing can come after a manual decision, so new ones go before it.
              const manualAt = d.tiebreakers.findIndex((t) => t.kind === 'manual')
              if (kind !== 'manual' && hasManual) d.tiebreakers.splice(manualAt, 0, tiebreaker)
              else d.tiebreakers.push(tiebreaker)
            })
          }
          aria-label="Add tiebreaker"
        >
          <option value="">+ Add tiebreaker…</option>
          {available.map((kind) => (
            <option key={kind} value={kind}>
              {TIEBREAKER_LABELS[kind]}
            </option>
          ))}
        </select>
      )}
    </Section>
  )
}
