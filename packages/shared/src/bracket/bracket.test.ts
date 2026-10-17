import { describe, expect, it } from 'vitest'
import { type Bracket, type BracketFormat, generateBracket, roundName, seedOrder } from './generate'
import { type NodeMatch, dependentsOf, resolveBracket } from './resolve'

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

/** Small deterministic random generator, so failures can be reproduced. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Plays every ready match with `pick` choosing the winner, until nothing is left. */
function playOut(bracket: Bracket, seeding: string[], pick: (nodeId: string) => 1 | 2) {
  const matches = new Map<string, NodeMatch>()
  for (let guard = 0; guard < 1000; guard++) {
    const resolved = resolveBracket(bracket, seeding, matches)
    const ready = [...resolved.nodes.values()].filter((n) => n.state === 'ready')
    if (!ready.length) return { resolved, matches }
    for (const node of ready) {
      matches.set(node.node.id, {
        matchId: node.node.id,
        finished: true,
        winner: pick(node.node.id),
      })
    }
  }
  throw new Error('Bracket never finished')
}

function lossesPerPlayer(result: ReturnType<typeof playOut>) {
  const losses = new Map<string, number>()
  for (const node of result.resolved.nodes.values()) {
    if (node.state === 'done' && node.loser.kind === 'player') {
      losses.set(node.loser.playerId, (losses.get(node.loser.playerId) ?? 0) + 1)
    }
  }
  return losses
}

describe('seedOrder', () => {
  it('keeps the top seeds apart', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe('generateBracket', () => {
  it('builds a single-elimination bracket', () => {
    const bracket = generateBracket(8, { kind: 'single', thirdPlace: true })
    expect(bracket.size).toBe(8)
    expect(bracket.nodes.filter((n) => n.side === 'winners')).toHaveLength(7)
    expect(bracket.nodes.find((n) => n.id === '3P')?.slots).toEqual([
      { kind: 'loserOf', nodeId: 'W2-1' },
      { kind: 'loserOf', nodeId: 'W2-2' },
    ])
  })

  it('builds a double-elimination bracket', () => {
    const bracket = generateBracket(8, { kind: 'double', grandFinalReset: true })
    const count = (side: string) => bracket.nodes.filter((n) => n.side === side).length
    expect(count('winners')).toBe(7)
    expect(count('losers')).toBe(6)
    expect(count('grandFinal')).toBe(1)
    expect(count('reset')).toBe(1)
  })

  it('handles two players in double elimination', () => {
    const bracket = generateBracket(2, { kind: 'double', grandFinalReset: false })
    expect(bracket.nodes.map((n) => n.id)).toEqual(['W1-1', 'GF'])
  })

  it('rejects fewer than two players', () => {
    expect(() => generateBracket(1, { kind: 'single', thirdPlace: false })).toThrow()
  })

  it('names rounds', () => {
    const single = generateBracket(8, { kind: 'single', thirdPlace: false })
    expect(single.nodes.map((n) => roundName(single, n))).toEqual([
      ...Array(4).fill('Quarterfinals'),
      'Semifinals',
      'Semifinals',
      'Final',
    ])
    const double = generateBracket(4, { kind: 'double', grandFinalReset: true })
    expect(double.nodes.map((n) => roundName(double, n))).toEqual([
      'Winners semifinals',
      'Winners semifinals',
      'Winners final',
      'Losers round 1',
      'Losers final',
      'Grand final',
      'Grand final reset',
    ])
  })
})

describe('resolveBracket', () => {
  it('gives the top seeds byes', () => {
    const bracket = generateBracket(6, { kind: 'single', thirdPlace: false })
    const { nodes } = resolveBracket(bracket, players(6), new Map())
    expect(nodes.get('W1-1')).toMatchObject({
      state: 'walkover',
      winner: { kind: 'player', playerId: 'p1' },
    })
    expect(nodes.get('W1-2')).toMatchObject({ state: 'ready' }) // 4 vs 5
    expect(nodes.get('W2-1')).toMatchObject({
      state: 'waiting',
      entrants: [{ kind: 'player', playerId: 'p1' }, { kind: 'pending' }],
    })
  })

  it('tracks a match from ready to done', () => {
    const bracket = generateBracket(2, { kind: 'single', thirdPlace: false })
    const ready = resolveBracket(bracket, players(2), new Map())
    expect(ready.nodes.get('W1-1')?.state).toBe('ready')
    expect(ready.champion).toBeNull()

    const playing = resolveBracket(
      bracket,
      players(2),
      new Map([['W1-1', { matchId: 'm', finished: false, winner: null }]]),
    )
    expect(playing.nodes.get('W1-1')?.state).toBe('playing')

    const done = resolveBracket(
      bracket,
      players(2),
      new Map([['W1-1', { matchId: 'm', finished: true, winner: 2 }]]),
    )
    expect(done.champion).toBe('p2')
    expect(done.placements).toEqual([
      { place: 1, playerIds: ['p2'] },
      { place: 2, playerIds: ['p1'] },
    ])
  })

  it('skips the reset when the winners-bracket player wins the grand final', () => {
    const bracket = generateBracket(2, { kind: 'double', grandFinalReset: true })
    const result = playOut(bracket, players(2), () => 1)
    expect(result.resolved.nodes.get('GF2')?.state).toBe('skipped')
    expect(result.resolved.champion).toBe('p1')
  })

  it('plays the reset when the losers-bracket player wins the grand final', () => {
    const bracket = generateBracket(2, { kind: 'double', grandFinalReset: true })
    // p1 wins the first match, p2 wins the grand final, then p1 wins the reset.
    const result = playOut(bracket, players(2), (id) => (id === 'GF' ? 2 : 1))
    expect(result.resolved.nodes.get('GF2')?.state).toBe('done')
    expect(result.resolved.champion).toBe('p1')
  })

  it('shares third place between semifinal losers without a third-place match', () => {
    const bracket = generateBracket(4, { kind: 'single', thirdPlace: false })
    const result = playOut(bracket, players(4), () => 1)
    expect(result.resolved.placements).toEqual([
      { place: 1, playerIds: ['p1'] },
      { place: 2, playerIds: ['p2'] },
      { place: 3, playerIds: ['p4', 'p3'] },
    ])
  })

  it('finds the nodes that depend on a result', () => {
    const bracket = generateBracket(4, { kind: 'double', grandFinalReset: false })
    expect(dependentsOf(bracket, 'W1-1').map((n) => n.id)).toEqual(['W2-1', 'L1-1'])
    const withReset = generateBracket(4, { kind: 'double', grandFinalReset: true })
    expect(dependentsOf(withReset, 'GF').map((n) => n.id)).toEqual(['GF2'])
  })
})

describe('full tournaments (simulated)', () => {
  const formats: BracketFormat[] = [
    { kind: 'single', thirdPlace: false },
    { kind: 'single', thirdPlace: true },
    { kind: 'double', grandFinalReset: false },
    { kind: 'double', grandFinalReset: true },
  ]

  for (const format of formats) {
    it(`always finishes with a champion: ${JSON.stringify(format)}`, () => {
      for (let n = 2; n <= 16; n++) {
        for (let seed = 1; seed <= 20; seed++) {
          const random = rng(seed * 100 + n)
          const bracket = generateBracket(n, format)
          const result = playOut(bracket, players(n), () => (random() < 0.5 ? 1 : 2))
          const context = `${n} players, seed ${seed}`

          const champion = result.resolved.champion
          expect(champion, context).not.toBeNull()
          const unresolved = [...result.resolved.nodes.values()].filter(
            (node) => node.state === 'waiting' || node.state === 'playing',
          )
          expect(unresolved, context).toEqual([])

          const losses = lossesPerPlayer(result)
          for (const player of players(n)) {
            const count = losses.get(player) ?? 0
            if (format.kind === 'single') {
              // The third-place match gives two players a second loss.
              const max = format.thirdPlace ? 2 : 1
              if (player === champion) expect(count, context).toBe(0)
              else expect(count, context).toBeGreaterThanOrEqual(1)
              expect(count, context).toBeLessThanOrEqual(max)
            } else if (player === champion) {
              expect(count, context).toBeLessThanOrEqual(1)
            } else if (format.grandFinalReset) {
              expect(count, `${context}, ${player}`).toBe(2)
            } else {
              // Without a reset the winners-bracket champion is out after one loss.
              expect([1, 2], `${context}, ${player}`).toContain(count)
            }
          }
        }
      }
    })
  }

  it('plays n − 1 matches in single elimination', () => {
    for (let n = 2; n <= 16; n++) {
      const result = playOut(
        generateBracket(n, { kind: 'single', thirdPlace: false }),
        players(n),
        () => 1,
      )
      const played = [...result.resolved.nodes.values()].filter((node) => node.state === 'done')
      expect(played, `${n} players`).toHaveLength(n - 1)
    }
  })
})
