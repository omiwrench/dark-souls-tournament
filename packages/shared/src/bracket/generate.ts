import { z } from 'zod'

export const BracketFormatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), thirdPlace: z.boolean().default(false) }),
  z.object({ kind: z.literal('double'), grandFinalReset: z.boolean().default(false) }),
])
export type BracketFormat = z.infer<typeof BracketFormatSchema>

/** Where a bracket slot's player comes from. */
export type Source =
  | { kind: 'seed'; seed: number }
  | { kind: 'winnerOf'; nodeId: string }
  | { kind: 'loserOf'; nodeId: string }

export type BracketSide = 'winners' | 'losers' | 'thirdPlace' | 'grandFinal' | 'reset'

export type BracketNode = {
  id: string
  side: BracketSide
  /** 1-based within its side. */
  round: number
  /** 1-based position within the round, top to bottom. */
  position: number
  slots: [Source, Source]
}

export type Bracket = {
  format: BracketFormat
  /** Bracket size: the player count rounded up to a power of two. */
  size: number
  playerCount: number
  nodes: BracketNode[]
}

/**
 * The order seeds are placed in the first round, so that 1 meets the lowest seed and the
 * top seeds can only meet late: [1, 8, 4, 5, 2, 7, 3, 6] for 8.
 */
export function seedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((seed) => [seed, n + 1 - seed])
  }
  return order
}

const winnerOf = (nodeId: string): Source => ({ kind: 'winnerOf', nodeId })
const loserOf = (nodeId: string): Source => ({ kind: 'loserOf', nodeId })
const wId = (round: number, position: number) => `W${round}-${position}`
const lId = (round: number, position: number) => `L${round}-${position}`

/**
 * Builds the bracket structure. Seeds above the player count are byes; the resolver
 * advances their opponents automatically.
 */
export function generateBracket(playerCount: number, format: BracketFormat): Bracket {
  if (!Number.isInteger(playerCount) || playerCount < 2) {
    throw new Error('A bracket needs at least two players')
  }
  const size = 2 ** Math.ceil(Math.log2(playerCount))
  const rounds = Math.log2(size)
  const nodes: BracketNode[] = []

  // Winners bracket.
  const order = seedOrder(size)
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round
    for (let position = 1; position <= count; position++) {
      const slots: [Source, Source] =
        round === 1
          ? [
              { kind: 'seed', seed: order[2 * position - 2]! },
              { kind: 'seed', seed: order[2 * position - 1]! },
            ]
          : [winnerOf(wId(round - 1, 2 * position - 1)), winnerOf(wId(round - 1, 2 * position))]
      nodes.push({ id: wId(round, position), side: 'winners', round, position, slots })
    }
  }

  if (format.kind === 'single') {
    if (format.thirdPlace && rounds >= 2) {
      nodes.push({
        id: '3P',
        side: 'thirdPlace',
        round: 1,
        position: 1,
        slots: [loserOf(wId(rounds - 1, 1)), loserOf(wId(rounds - 1, 2))],
      })
    }
    return { format, size, playerCount, nodes }
  }

  // Losers bracket: 2 × (rounds − 1) rounds. Odd rounds pair up survivors; even rounds
  // take in the losers of the next winners round.
  const losersRounds = 2 * (rounds - 1)
  for (let round = 1; round <= losersRounds; round++) {
    const count = size / 2 ** (Math.floor((round + 1) / 2) + 1)
    for (let position = 1; position <= count; position++) {
      let slots: [Source, Source]
      if (round === 1) {
        slots = [loserOf(wId(1, 2 * position - 1)), loserOf(wId(1, 2 * position))]
      } else if (round % 2 === 0) {
        // Losers dropping down. Every other round they come in reversed, so players who
        // just met are less likely to meet again straight away.
        const winnersRound = round / 2 + 1
        const dropFrom = (round / 2) % 2 === 1 ? count + 1 - position : position
        slots = [winnerOf(lId(round - 1, position)), loserOf(wId(winnersRound, dropFrom))]
      } else {
        slots = [winnerOf(lId(round - 1, 2 * position - 1)), winnerOf(lId(round - 1, 2 * position))]
      }
      nodes.push({ id: lId(round, position), side: 'losers', round, position, slots })
    }
  }

  const losersChampion = losersRounds > 0 ? winnerOf(lId(losersRounds, 1)) : loserOf(wId(1, 1))
  const finalists: [Source, Source] = [winnerOf(wId(rounds, 1)), losersChampion]
  nodes.push({ id: 'GF', side: 'grandFinal', round: 1, position: 1, slots: finalists })
  if (format.grandFinalReset) {
    // The same two players on the same sides. Only played if the losers-bracket player
    // wins the grand final (see resolveBracket).
    nodes.push({ id: 'GF2', side: 'reset', round: 1, position: 1, slots: [...finalists] })
  }
  return { format, size, playerCount, nodes }
}

/** A human name for a node's round, e.g. "Semifinals" or "Losers round 3". */
export function roundName(bracket: Bracket, node: BracketNode): string {
  const rounds = Math.log2(bracket.size)
  switch (node.side) {
    case 'winners': {
      const fromEnd = rounds - node.round
      const name = ['Final', 'Semifinals', 'Quarterfinals'][fromEnd] ?? `Round ${node.round}`
      return bracket.format.kind === 'double' ? `Winners ${name.toLowerCase()}` : name
    }
    case 'losers':
      return node.round === 2 * (rounds - 1) ? 'Losers final' : `Losers round ${node.round}`
    case 'thirdPlace':
      return 'Third place'
    case 'grandFinal':
      return 'Grand final'
    case 'reset':
      return 'Grand final reset'
  }
}
