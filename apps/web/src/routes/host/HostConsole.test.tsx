import { renderToString } from 'react-dom/server'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'
import { type MatchDetail, bellRush } from '@dst/shared'
import { createHarness } from '@dst/shared/testing'
import { Console } from './HostConsole'

/** Renders the console the way the browser would on first paint, for a given match. */
function render(play: (h: ReturnType<typeof createHarness>) => void) {
  const h = createHarness(bellRush)
  play(h)
  const state = h.state()
  const players = [
    { id: 'a', name: 'Alice', color: null, createdAt: '' },
    { id: 'b', name: 'Bob', color: '#00ff00', createdAt: '' },
  ] as MatchDetail['players']
  const detail: MatchDetail = {
    id: 'm',
    tournamentId: null,
    players,
    rulesetName: bellRush.name,
    status: state.status,
    winner: state.result?.winner ?? null,
    scores: [state.players[0].score, state.players[1].score],
    createdAt: '',
    finishedAt: null,
    playerSetup: [{}, {}],
    ruleset: bellRush,
    events: h.events,
  }
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <Console
          detail={detail}
          state={{ ...state, setup: { ...state.setup, players } }}
          send={async () => []}
        />
      ),
    },
  ])
  // React separates adjacent text with comment markers; drop them for readable assertions.
  return renderToString(<RouterProvider router={router} />).replaceAll('<!-- -->', '')
}

describe('host console', () => {
  it('renders a match that has not started', () => {
    const html = render(() => {})
    expect(html).toContain('Start match')
    expect(html).toContain('Asylum Demon')
    expect(html).toContain('Nothing has happened yet')
  })

  it('renders a live match with events', () => {
    const html = render((h) => {
      h.start()
      h.advance(60_000)
      h.send({ type: 'completeObjective', player: 1, objectiveId: 'asylum-demon' })
      const death = h.send({ type: 'logDeath', player: 2 })
      h.send({ type: 'setVariants', targetSeq: death, variantIds: ['fall-damage'] })
      const undone = h.send({ type: 'completeObjective', player: 2, objectiveId: 'black-knight' })
      h.send({ type: 'undo', targetSeq: undone })
    })
    expect(html).toContain('Pause')
    expect(html).toContain('Alice leads by 500')
    expect(html).toContain('Death (Fall damage)')
    expect(html).toContain('Bob drinks ×3')
    expect(html).toContain('(undone)')
  })

  it('renders tiebreaker mode', () => {
    const html = render((h) => {
      h.start()
      h.send({ type: 'endMatch' })
    })
    expect(html).toContain('Switch to Dark Souls 3')
    expect(html).toContain('Alice wins')
    expect(html).toContain('Bob wins')
  })

  it('renders a finished match', () => {
    const html = render((h) => {
      h.start()
      h.send({ type: 'completeObjective', player: 2, objectiveId: 'bell-of-awakening' })
    })
    expect(html).toContain('Bob wins')
    expect(html).toContain('on points')
  })
})
